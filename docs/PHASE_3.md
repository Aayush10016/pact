# Phase 3: local security and provider validation

Phase 3 implementation is available, but the release gate remains open. Real authenticated
two-party PayPal capture/refund and signed financial webhook receipts have not been observed.
Provider contract doubles are explicitly separate from real provider validation below.

## Verified locally on 7 October 2026

| Provider                       | Result                            | Actual proof and boundary                                                                                                                                                                                                                    |
| ------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clerk                          | BLOCKED: interactive lifecycle    | Official CLI login/link/doctor and backend key/JWKS connectivity pass for app_3KKX2pTNsmtO0pxVeOwtGPSZubN. Sign-in/sign-up routes respond. Two real users, invitation acceptance and backend session identity still require browser sign-in. |
| MinIO                          | PASS                              | Ten real checks: private bucket, upload, checksum, immutable duplicate rejection, signed download, expiry, anonymous denial, clean scan, EICAR detection and oversize rejection. Separate restart/volume restore verifies bytes.             |
| NVIDIA NIM                     | PASS: bounded evaluation          | Five real calls pass: commitment extraction, supported, insufficient, conflicting and injected evidence. Earlier runs returned malformed quotations/timeouts and were rejected; this is not a reliability or calibration guarantee.          |
| PayPal Sandbox                 | BLOCKED: buyer/party approval     | Real OAuth and webhook management registration pass. No real Sandbox capture observed.                                                                                                                                                       |
| PayPal webhook                 | BLOCKED: signed financial receipt | Real registration and unsigned rejection pass through restricted HTTPS relay. No signed capture/refund event observed; registration alone does not prove verification.                                                                       |
| PayPal readback/reconciliation | BLOCKED: real financial operation | PostgreSQL integration tests validate exact readback matching and operator reconciliation using a test provider. No real ambiguous PayPal operation reconciled.                                                                              |
| PayPal refund                  | BLOCKED: real captured payment    | Full/partial refund and ambiguous-result guards pass with test doubles. Real refund needs captured Sandbox payment and both parties' current consent.                                                                                        |

No path exists from AI output directly to PayPal execution. AI has neither financial tools nor
PayPal credentials. Models return proposals; persisted fresh human consent authorizes execution.

## Free local setup

Preserve the existing ignored `.env`. Use `.env.example` only for a new environment. Never paste
credentials into chat or commit them. No paid storage, OCR, malware scanning, monitoring or tunnel
service is required. NVIDIA hosted API availability depends on the account's free access/limits;
provider unavailability fails closed rather than substituting a fake provider.

```powershell
pnpm install --frozen-lockfile
pnpm prepare:packages
docker --context desktop-linux compose up -d --build postgres redis minio clamav ai
pnpm db:bootstrap
node scripts/minio-bootstrap.mjs
pnpm build
node scripts/dev-web-local.mjs start
```

Run the API separately with the existing API scripts, or use all-container Compose after stopping
native processes occupying ports 3000/4000. Docker uses persistent named volumes. Do not use
`down --volumes`, factory reset or WSL unregister as a routine troubleshooting step.

MinIO is built from the pinned official community source in `infrastructure/docker/minio.Dockerfile`.
It uses S3-compatible private storage, versioning and a persistent volume. Its console is disabled.
The disposable development credential placeholders must be changed before any shared deployment.
ClamAV uses the pinned image digest and persistent signature definitions; initial download/startup
can take several minutes and scanning remains unavailable until ready. R2 is retained for future
production configuration; local Phase 3 does not require R2 billing.

Storage defaults: `EVIDENCE_STORAGE=minio`, internal Docker endpoint `http://minio:9000`, browser
download endpoint `http://localhost:9000`, private bucket `pact-evidence`. Native API uses localhost
for both endpoints. Keep the public endpoint reachable by the browser and the bucket private.

## Clerk

Existing `@clerk/nextjs` integration is retained. CLI was authenticated and linked rather than
scaffolding/reinstalling the application. Proxy matchers include API/TRPC then `/__clerk/:path*`
once. `ClerkProvider` remains inside body. Server identity verifies RS256, exact issuer, expiry,
session and authorized origin, then fetches verified primary email. Membership gates every Pact
read/write, evidence access and approval. Invitation email must match verified identity.

Set keys from the same development app and a bare HTTPS `CLERK_ISSUER` matching its public-key
domain. `node scripts/validate-clerk-config.mjs` verifies public JWKS and replaces only the known
example issuer placeholder. It never prints keys or user records. Use `http://localhost:3000`
consistently with `WEB_ORIGIN`; local Next binds localhost. Same-page Clerk rewrites are resumed
while retaining Clerk's verified request-header overrides, avoiding self-proxy loops under Docker.

Official CLI: `pnpm dlx clerk@3.4.0 doctor`. Development app connectivity passed; production
instance configuration is still absent. Doctor's generic env-name warnings are not proof of
missing keys when the application uses `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.

Remaining user action: open `/sign-up`, establish two distinct verified test users, and review
invitation/terms from both accounts. Credentials and verification codes stay in the browser.
Automation must not impersonate an existing real user or fabricate human consent.

## Evidence and AI

Upload is bounded to 8 MiB, immutable object key/hash and database version. Every version starts
quarantined. ClamAV INSTREAM runs before extraction or AI. Infected files are not downloaded or
analyzed; scanner errors fail closed with audit/notification records. Legacy READY versions
without a CLEAN scan cannot be downloaded or included in assessments; they require reprocessing.
TXT/PDF/DOCX processing remains bounded. PNG/JPEG now supports local Tesseract English OCR:
MIME/magic verification, one image, at most 8 million pixels, subprocess time/CPU/memory limits.
OCR text is marked untrusted and follows the same citation rules. URLs remain disabled.

NVIDIA uses the existing backend-to-AI provider boundary and official HTTPS endpoint. The tested
model is `nvidia/nemotron-3.5-lightning-30b-a3b`, with its documented thinking switch disabled to
fit the bounded response budget. Strict JSON schema, bounded response size and independent
Pydantic/Zod citation checks reject invalid output. Every factual claim must be an exact substring
of a supplied citation and every citation must match its evidence ID/content. Inference is separate.
Confidence is **a bounded model estimate, not measured statistical calibration**.

Internal `/v1/commitments/extract` requires service identity and returns human-review-only
commitment suggestions, criteria, deadlines, deliverables and milestones. It does not automatically
write agreed terms. Extraction output with invented agreement quotations is rejected.

```powershell
node scripts/validate-local-security.mjs
node scripts/validate-nim.mjs
```

For Python tests use the host virtual environment as in README. Real OCR drill is
`apps/ai/evaluations/ocr.py`, run inside the AI
image with Tesseract. NIM evaluations send synthetic evidence only, not private user evidence.
Live calls are opt-in and excluded from CI. Failed earlier evaluations are retained in local logs;
the final policy improvement was evaluated against the complete fixed dataset, not just one case.

## PayPal and restricted free webhook tunnel

API endpoint is `POST /v1/webhooks/paypal`, local port 4000. It requires the five PayPal transmission
headers and official PayPal verification against the configured real `PAYPAL_WEBHOOK_ID`.
It persists verified events before processing and independently reads PayPal order/capture/refund
records before changing money. Return URLs, accepted requests and AI never confirm money.

The free Cloudflare Quick Tunnel exposes a **webhook-only relay**, not the entire API:

```powershell
node scripts/webhook-relay.mjs
cloudflared tunnel --url http://127.0.0.1:4001 --edge-ip-version 4 --protocol http2 --no-autoupdate
```

Capture the tunnel's public URL in `.tunnel-phase3-error.log` for the local registration helper.
`node scripts/register-paypal-webhook.mjs` verifies private routes return 404 and unsigned events
are rejected, authenticates to Sandbox, reuses/registers the exact URL, and saves the webhook ID
only in `.env`. Restart the API after changing env. Subscribe to CHECKOUT.ORDER.APPROVED,
PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.REFUNDED and PAYMENT.CAPTURE.DENIED.
Quick Tunnel URLs are temporary: re-register after a changed URL and keep the relay/tunnel running
while testing. The relay forwards only exact webhook POSTs and the required signature headers,
with JSON/body/time bounds; other paths return 404. Nothing requires a credit card.

The actual current URL is recorded in private local runtime logs; do not publish financial payloads,
bearer tokens, evidence download URLs or buyer passwords. Registration has already succeeded.

## Financial reconciliation and retention

Financial workers atomically claim QUEUED operations. EXECUTING, NEEDS_RECONCILIATION,
PROVIDER_ACCEPTED and terminal attempts never automatically issue another financial POST.
An ambiguous result blocks further financial proposals. Operator review uses provider GET
readback, exact ownership/order/capture linkage, integer amount/currency matching, current
transaction version and both parties' fresh version/hash consent. Persisted idempotency and locks
prevent double accounting. Crash-stuck EXECUTING requires at least ten minutes before readback.

Configure an explicit server-side comma-separated `PACT_OPERATOR_SUBJECTS` allowlist. No role
is granted by a browser flag or email. Authenticated, allowlisted operators may use:

- `POST /v1/operations/:operationId/reconcile`: requestId UUID, expectedStatus,
  expectedTransactionVersion, providerId and reason. Unknown/mismatched states are rejected.
- `GET /v1/operations/monitoring`: financial/scan states, failed webhook/AI and pending outbox counts.
- `GET /v1/operations/evidence/:versionId/retention`: audited retention review with deletion disabled.

Reconciliation requests/readback outcomes are audited and successful reviews are append-only.
They never initiate a refund/capture. Test doubles validate this contract; real ambiguous operation
readback remains a live validation gate.

Retention refuses legal holds, active/disputed/unknown Pacts, unsettled money, unresolved attempts,
pending webhooks and unretired resolutions. Minimum 365 days runs from the latest relevant
upload/Pact/payment activity. Even eligible evidence requires operator review; automatic physical
deletion is disabled. Financial/audit records are preserved. MinIO versioning means future purge
must explicitly address every version and legal hold; no purge endpoint is claimed here.

Party notifications expose safe event types/IDs, not private evidence. Monitoring requires no SaaS.
Health/readiness endpoints indicate local dependencies, not certification of external providers.

## Recovery drills

Pause writers before a consistent recovery drill. Backups contain private records; keep them outside
Git and protect the chosen local folder. Both scripts create fresh recovery resources and never
overwrite the original database or evidence volume.

```powershell
node scripts/backup-restore-local.mjs <private-backup-folder>
node scripts/minio-recovery-local.mjs <private-backup-folder>
```

PostgreSQL: custom pg*dump archive → fresh `pact_restore*<timestamp>` → pg_restore with
exit-on-error → exact row/count comparison for 12 lifecycle/financial/audit tables. Actual drill passed.
MinIO: stop source for a consistent volume archive → restart source → restore into a fresh retained
volume and temporary recovery container → SHA-256 verify original and restored synthetic object.
Actual restart/restore drill passed. Private archive paths and credentials are excluded from handoff.
Recovery volumes/databases remain available for inspection; temporary recovery container is removed.

Redis is queue transport, never authoritative money. Outbox and persisted operations support recovery;
financial ambiguity requires reconciliation. A production RPO/RTO or disaster-recovery guarantee is
not established by one local drill.

## Quality and design

Local integration helper `node scripts/test-integration-local.mjs` uses only `pact_phase3_tests` and
Redis DB 3, separately from the running application. Do not run mutable integration fixtures against
the active application database. CI uses isolated services and no provider credentials.
Container CI additionally runs real MinIO/ClamAV probes. Provider doubles exist only in tests.

Unavailable MinIO and scanner endpoints were tested through real network failures and rejected.
Actual PostgreSQL/Redis restarts preserved original rows in 12 tables. The API idle-pool error
handler was corrected and subsequent restart validation confirmed readiness recovery without
restarting the API process. Dependency auditing identified outdated Starlette/pytest vulnerabilities;
patched compatible FastAPI/Starlette/pytest versions pass the Python tests and repeat audit.

The Phase 1 landing, global CSS, colors, geometry, logo, navigation and four tabs remain intact.
Figma reference Dj8BmtS686mqCGeCCQVDwc nodes 6:29 and 4:82 were inspected for actual approved
typography. A scoped workspace stylesheet restores body 15/24, labels 13/20, metadata 12/18 and
approved heading hierarchy with mobile adjustments. No new visual theme was introduced.

Browser checks with real Clerk configured: 20 passed, including 16 automated accessibility route
checks on desktop/mobile. The unconfigured identity lane is a separate test, not a mocked live login.
Real sign-up/session/invitation/payment forms still require users and Sandbox interaction.
Exact latest counts, commit/CI and external blockers belong in the dated final handoff.

## Docker Desktop stale socket recovery

The reported startup failure referenced `%LOCALAPPDATA%\docker-secrets-engine\engine.sock`.
Another stale socket existed under `%LOCALAPPDATA%\Docker\run\dockerInference`.
Only verified Docker processes were stopped; the affected runtime folders were renamed to dated
`pact-recovery` backups and recreated before relaunching Desktop. Docker 29.6.1 and all local
dependency services subsequently reported healthy. No factory reset, volume removal, WSL reset
or repository deletion was performed. Keep those runtime backups until stability is established.
