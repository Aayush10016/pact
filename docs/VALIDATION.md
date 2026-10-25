# Pact Phase 1 handoff

Built in `C:\Users\Aayush Tiwari\Desktop\PACT` on 6 October 2026. The folder was inspected and empty before creation. The recovered `Pasted text.txt` master bootstrap prompt supplied the scope.

Repository: [Aayush10016/pact](https://github.com/Aayush10016/pact), private. The connector profile and authenticated CLI account were verified as exactly **Aayush10016**. Every push checks that account again. No repository was created under another account.

Design: [Editable Pact Figma foundation](https://www.figma.com/design/Dj8BmtS686mqCGeCCQVDwc).

## Exact stack

| Area         | Versions                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| Runtime      | Node 24.18.0, pnpm 11.20.0, TypeScript 5.9.3                                                             |
| Frontend     | Next.js 16.3.8 App Router, React 19.3.0, Tailwind CSS 4.3.3                                              |
| REST API     | NestJS 12.1.2, Zod 4.1.13                                                                                |
| AI service   | Python 3.11.0 local / 3.11.14 Docker, FastAPI 0.128.0, Pydantic 2.12.5, Uvicorn 0.40.0                   |
| Data/jobs    | PostgreSQL 17.7, Redis 7.4.7, BullMQ 5.65.1, pg 8.16.3, ioredis 5.8.2                                    |
| Checks       | Vitest 4.0.18, Playwright 1.58.2, axe-core/playwright 4.11.1, pytest 9.0.2, Ruff 0.14.10, Prettier 3.8.1 |
| Brand assets | Manrope Variable 5.3.0, Source Serif 4 Variable 5.3.0, IBM Plex Mono 5.2.7, Lucide React 0.468.0         |

Versions and JavaScript/Python lockfiles are committed. Fonts are packaged locally.

## Architecture and engineering

The pnpm monorepo separates `apps/web`, `apps/api`, `apps/ai`, and shared types/domain/config packages. The intended boundary is web â†’ authenticated API â†’ internal AI. PostgreSQL owns authoritative records; Redis/BullMQ runs jobs. Private R2 evidence storage is reserved for Phase 2.

- Frontend: branded landing, sample workspace, search/status filters, activity, validated session-only draft, and Pact commitment/evidence/assessment/resolution views. Responsive layouts, keyboard focus, skip navigation, field labels, and empty/loading/error states are included.
- Backend: modular NestJS REST, health and real database/Redis readiness, typed sample resources, strict draft validation, safe error handling, JSON logs, scoped CORS, Helmet, and shutdown hooks. Financial requests are rejected even with a forged bearer token.
- AI: separate FastAPI service, strict Pydantic contracts, NVIDIA NIM/OpenAI provider abstraction, evidence citation checks, health and provider capabilities. Assessment requests intentionally return 501. There are no vendor calls or real reasoning.
- Database: transaction-protected migrations with advisory locking and checksums; 16 foundation entities, foreign keys, unique/check constraints, integer minor-unit money, indexes, and immutable audit trigger. Persisted identity and cross-record ownership checks remain Phase 2 work.
- Redis: actual Redis/BullMQ integration tests verify deduplication. Redis is never authoritative payment state.
- Infrastructure: persistent PostgreSQL/Redis, one-shot migration, non-root application containers, health dependencies, loopback binding, configurable host ports, CI, and development-only environment placeholders.

**AI understands. AI recommends. Humans authorize. PayPal executes.** Live authentication, persistent business APIs, uploads, reasoning/OCR, complete disputes, and payments are outside Phase 1. No real secrets were added; `.env` is ignored.

## Design and Figma

Warm paper, forest green, restrained copper, precise borders, whitespace, and editorial hierarchy define the visual language. Source Serif 4 gives headings a human voice; Manrope handles interface text; IBM Plex Mono distinguishes amounts and metadata. The UI avoids gradients, glass, neon, and AI imagery.

Figma explores Joining, Shared boundary, and Paired brackets logo routes. Joining was selected: two upright commitments connected by a common bridge. Its matching vector is implemented in the logo and favicon.

Figma includes primitive/semantic token aliases, typography styles, reusable buttons/badges/inputs and states, desktop/mobile landing, desktop workspace, Pact detail, and create-Pact layouts. Existing team library discovery found no compatible controls/tokens. Separate light/dark collections respect the Starter plan's mode limit; the application currently ships light mode. Frames use editable text, vectors, and component instances.

Seven rendered application screenshots were inspected across 1440, 768, and 390px. Fonts loaded correctly, with no horizontal overflow or browser JavaScript errors.

## Validation

[Corrected GitHub Actions run 37465600748](https://github.com/Aayush10016/pact/actions/runs/37465600748) passed all three jobs: JavaScript, Python, and containers, for implementation commit `3842f3e`.

| Command/check                                              | Result                                                                                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` / `pnpm prepare:packages` | Passed locally and in CI                                                                                                            |
| `pnpm lint` / `pnpm typecheck`                             | Passed locally and in CI                                                                                                            |
| `pnpm format:check`                                        | Passed locally                                                                                                                      |
| `pnpm test`                                                | 10 passed: domain contracts and API boundaries                                                                                      |
| `pnpm db:migrate`                                          | Applied and safely rerun locally; passed CI                                                                                         |
| `pnpm test:integration`                                    | 2 passed with actual PostgreSQL/Redis/BullMQ                                                                                        |
| `pnpm build`                                               | NestJS and production Next.js builds passed locally and in CI                                                                       |
| `ruff check apps/ai` / `pytest apps/ai`                    | Ruff passed; 5 tests passed, one upstream deprecation warning                                                                       |
| `pnpm test:e2e`                                            | All 14 checks passed in corrected CI; locally 12 passed on the final full run and the 2 cold-load failures passed on targeted rerun |
| `pnpm audit --prod --audit-level=high`                     | No known vulnerabilities found at validation time                                                                                   |
| `docker compose config --quiet`                            | Passed                                                                                                                              |
| Container build and complete stack                         | Passed locally and in CI: final images, startup, migrations, and web/API/AI readiness                                               |
| Local health/readiness                                     | Web 200; API PostgreSQL/Redis ready; AI healthy                                                                                     |

The first browser CI run caught a progress indicator missing its semantic role. It now has a progressbar role and explicit min/max/current values; all 14 corrected CI tests pass. Initial Windows browser attempts also had cold-load timeouts, investigated using traces, direct HTTP probes, and visual captures. Initial dependency download timeouts were resolved through longer fetch timeouts and persistent caches. PostgreSQL uses host port 55432 because Windows reserved 5432.

Automated accessibility checks do not replace a full manual audit. This is a polished foundation, not a production financial release.

## Run and next phase

The README has complete setup and validation instructions. The local preview is `http://127.0.0.1:3000`, API readiness is `http://127.0.0.1:4000/ready`, and AI docs are `http://127.0.0.1:8000/docs`. Use `docker compose up --build --wait` for all containers; override `WEB_PORT`, `API_HOST_PORT`, and `AI_PORT` when defaults are occupied.

Included: README, AGENTS, PACT_SPEC, ARCHITECTURE, SECURITY, DESIGN_SYSTEM, CONTRIBUTING, Phase 2 plan, official references, and validation report. Next implementation order: identity/ownership, persistent Pact records, private evidence, advisory AI, versioned human approvals, and authorized PayPal Sandbox actions with verified webhooks.

No outstanding user decisions are required for Phase 1.

Local container validation used host ports 13000 (web), 14000 (API), and 18000 (AI), leaving native previews on their normal ports. All five long-running containers are healthy; the migration exited with code 0. The final local browser rerun passed both timed-out tests without changing assertions or adding retries to CI.

# Phase 2 / validation record â€” 2026-10-06

Status: implemented and locally validated; live provider lifecycle proof is outstanding.
The approved Phase 1 main branch remains unchanged. Work is on `codex/phase2-lifecycle`.
Authenticated GitHub identity was checked as exactly `Aayush10016` before each push.

| Check                                     | Result                                            |
| ----------------------------------------- | ------------------------------------------------- |
| Reproducible locked installation          | Passed                                            |
| Dependency audit, Vitest 4.1.11           | No known vulnerabilities                          |
| Formatting / ESLint / TypeScript          | Passed                                            |
| Unit tests                                | 18 passed                                         |
| PostgreSQL / Redis integration            | 14 passed                                         |
| FastAPI / extraction / NVIDIA contract    | 12 passed                                         |
| Python Ruff                               | Passed                                            |
| Production Next.js / NestJS build         | Passed                                            |
| Desktop/mobile browser and accessibility  | 22 passed                                         |
| Docker configuration, build, startup      | Passed; five services healthy, migration exited 0 |
| Earlier independent branch CI             | All three jobs passed at 3f5245a, run 37492839708 |
| Actual Clerk/R2/Nemotron/PayPal lifecycle | NOT RUN: provider settings absent                 |

The 14 integration tests use real PostgreSQL, Redis and application services. The eight security
workflow tests isolate identity, object storage, model HTTP and PayPal with test-only doubles;
they verify internal authorization/accounting and do not prove external provider compatibility.
Both agreed delivery (no refund) and dispute (partial refund) paths require distinct persisted
approvals. Tests cover foreign-user reads/invitations/uploads/downloads, uploader-only versions,
immutable evidence/approval fields, stale consent, AI's lack of financial authority, duplicate
execute/webhook handling, provider-readback ownership, and rollback when workers are disabled.
Financial confirmation comes from a verified inbox and provider facts, never an accepted API call.

Python coverage includes provider timeout/unconfigured behavior, structured output validation,
unknown/unsupported citations, prompt boundaries, insufficient-evidence confidence limits, and
bounded TXT/PDF/DOCX parsing. One upstream Starlette/AnyIO deprecation warning remains.
No tests send real financial requests. URL ingestion and image OCR are disabled.

Browser checks cover the landing page, labeled preview workspace/draft/detail, about page,
private unavailable state and sign-in/sign-up across desktop/mobile. Automated WCAG checks found
no violations in those states. Authenticated live UI behavior still needs two configured Clerk
accounts and actual provider records; it was not falsely substituted with a demo login.

The original landing source, logo and global style sheet have no changes from 4bea598.
Figma's approved detail frame 6:29, tokens and typography were retrieved and compared against
the preserved component system. New forms/actions remain inside existing Pact tabs. Decisions
show exact amount/currency/consequence; approve/reject have equal styling. No global redesign.

## Live gates still required in Phase 2

Configure the ignored local environment with Clerk keys/issuer, private R2 bucket credentials,
NVIDIA Nemotron key/model, and PayPal Sandbox merchant credentials/webhook ID. Register a public
HTTPS webhook and use separate Sandbox buyer/merchant accounts. Execute the happy and dispute
paths in docs/PHASE_2.md, with real uploaded evidence, real NIM output, real consent, a real refund,
and officially verified delivery/readback. Measure model behavior before describing confidence
as calibrated. Until then this is a draft integration implementation, not a completed release.

## Phase 3 work

Operator reconciliation, production financial review, notification delivery, malware scanning,
image OCR, calibrated evidence evaluations, retention controls, backup/restore drills,
monitoring integration and deployment hardening. These do not replace the missing Phase 2 gates.

## Human review and reputation (2026-10-11)

Production lint/types/build and encoding checks passed. Unit/UI tests: 54 passed. Isolated PostgreSQL/Redis integration tests: 31 passed, including staff authorization, self-adjudication denial, private conversation scoping, request deduplication, stale versions, evidence-snapshot binding, no-response deadline, single refund execution, official readback, and verified-review eligibility/moderation. Python: Ruff passed and 27 tests passed. Desktop/mobile browser suite: 48 passed. The new ribbon logo was visually inspected on sign-in. A separate screenshot helper hit a browser screenshot protocol error while other browser checks were running; the complete primary browser suite and its screenshots passed.

Existing Test 3 remains captured with its 85% advisory match assessment intact. The selected local reviewer was resolved from a verified stored Clerk identity and configured privately; no real adjudication/refund of an existing user Pact was performed. Financial-provider doubles are confined to tests. The selected reviewer is a participant in Test 3, so another staff identity is required to adjudicate that particular Pact. The computer-use browser integration could not initialize on this host; live signed-in staff/member UI was checked through component/HTTP integration tests, not by claiming an inspected private browser session.

## Local password alert remediation (2026-10-11)

PostgreSQL owner/runtime passwords were rotated in the existing cluster, with new connections succeeding and both previous passwords rejected. MinIO was restarted against its preserved volume with a new private password; the new credentials can read the existing bucket and the previous password is rejected. Setup was checked in an isolated temporary directory: random credentials generated, a second run preserved settings, and Compose rejected missing required passwords. No database/storage volumes were removed. Existing Test 3 payment state and advisory match were checked unchanged. Lint, encoding, format and configured-secret scanning passed; 54 unit/UI and 31 isolated database/Redis integration tests passed. The original lowercase `pact.` wordmark remains with the uploaded ribbon mark.

## AI endpoint repair (2026-10-23)

The configured Nemotron 3 Super endpoint began returning HTTP 404 from NVIDIA despite its catalogue entry. The existing key successfully serves Nemotron 3.5 Lightning; the local model configuration was updated privately. Assessment decoding now requires the full commitment array with its exact application IDs and count, while server-side citation, confidence and ownership checks remain intact. Instructions-only content must not receive an unsupported numeric score. No silent provider/model fallback or AI financial authority was introduced.

The live evaluation was tightened so supported/conflicting cases require actual citations and an appropriate conclusion; blanket UNCLEAR output cannot pass those cases. An explicitly rejected adversarial output is recorded as a safety outcome, not a successful generated assessment or a provider availability pass. Final real evaluation: extraction, supported, insufficient, conflicting and injection cases all returned valid passing results. The rebuilt Docker AI service returned HTTP 200 for the existing private Test 3 resume snapshot, with a cited 85% match. This direct service check did not create a new stored analysis, change the agreement, or initiate a financial operation.

Ruff and 28 Python tests passed. Updated certifi, pypdf and Pillow pins passed pip-audit with no known vulnerabilities. Existing Test 3 payment and stored assessment remained intact. JavaScript package/image hardening and webhook repair are separate pending steps; the user clarified that the target remains local Sandbox.

## Hosted Sandbox preparation (2026-10-23)

Target clarified: zero-budget, invite-only Sandbox that must run with the development PC off. No hosting account, paid resource, DNS record or public deployment was created. A separate Compose overlay prepares HTTPS routing, private dependency ports, persistent volumes and bounded log rotation; verified tester emails are checked after Clerk verification and fail closed if malformed. Setup preserves local integration settings and writes generated infrastructure credentials only to an ignored private environment file.

Final checks: `pnpm check` passed with 61 unit/UI tests; isolated PostgreSQL/Redis integration tests: 31 passed; Ruff and 28 Python tests passed. Desktop/mobile browser suite: 48 passed, zero failures, skips or flaky results. Final JavaScript dependency audit reports zero vulnerabilities at every severity after Next/Vite/Vitest updates; the Python audit also passed. API/web Docker builds and local health checks passed. The merged Sandbox configuration check passed without logging expanded secrets.

The pinned Caddy configuration validated. Twelve real gateway checks passed, including private API/AI denial, unsigned/wrong-method/oversized webhook rejection, signed file bytes, and rejection of anonymous/expired downloads, uploads and administrative paths. Synthetic objects and the temporary gateway were removed. Local backup/restore matched exact fingerprints/counts for all 27 public tables using a fresh restore database; original data was preserved. Existing Test 3 agreement/payment/85-percent assessment stayed unchanged.

The foreground local webhook helper registered/read back its temporary restricted Sandbox callback and passed negative public-route checks. This is not signed financial-event acceptance or independent hosting. No new payment, refund, adjudication or stored AI assessment was initiated. Native Arm runtime validation, real hosted DNS/TLS/firewall, independent reviewer access, signed webhook delivery, host backup scheduling/restore and complete signed-in two-user acceptance remain deployment gates. The existing reviewer participates in Test 3 and cannot adjudicate it.

## Render / Supabase / Vercel preparation (2026-10-23)

Added an explicitly Free Render API definition and Vercel monorepo configuration. The backend accepts authenticated TLS Redis URLs and platform PORT fallback while retaining explicit API_PORT precedence. Evidence multipart POSTs can use a configured HTTPS API origin directly, preserving the 8 MB upload allowance without routing through Vercel's 4.5 MB function limit. Normal and financial requests keep the existing proxy. Invalid upload origins fail before transmission; the same backend authorization, quarantine and scan path applies. No financial decision logic, applied migration, credential or local data was changed.

Final `pnpm check` passed: encoding, lint, types, 65 unit/UI tests and production API/web builds. Format and configured-secret scans passed. Render configuration matched its official JSON Schema. The selected Vercel configuration fields validated against its published schema, but the vendor schema itself emitted a meta-validation warning in an unrelated trigger definition; this is not a successful strict meta-schema validation of the entire upstream document. Cloud dashboard validation is still required.

The browser reached Render sign-in; no deployment was created and no key was sent to a hosting provider. The local Docker engine was unavailable during this preparation, so integration/container/browser suites were not rerun against these changes; earlier results are recorded above and are not substituted for cloud acceptance. Live cross-origin preflight, real 8 MB upload, Supabase role/TLS/Data API isolation, cloud queue/AI/scanner/storage and signed PayPal Sandbox delivery remain unverified. Free scanner memory and secure connectivity remain unresolved. The deployment guide explicitly distinguishes these gates from a complete running application.

# Marketplace implementation and local acceptance — 2026-10-24

This is the latest validation entry; earlier sections retain the previous phases and their historical limitations.

Implemented public service discovery, service/name/category search, private listing drafts, versioned editing and publishing, agreement snapshots, correct delivering-party ownership and delivery dates from acceptance. One member can buy and offer services. Verified direct connected agreements use a separate explicitly selected endpoint and bind the receiving member's merchant before creation. Existing developer-merchant payment ownership is preserved.

PayPal onboarding uses durable account tracking, PayPal-hosted redirects and official merchant-integration readback. Browser return flags are not trusted. Merchant eligibility, confirmed email and exact platform payment/refund grants are checked. Order, capture, refund, receipt and reconciliation requests retain the transaction's bound merchant context. Signed onboarding/revocation event handling and webhook registration were added. Runtime database permissions remain restricted; migration 010 provides narrow checked functions instead of general recipient/deadline update privileges.

A real lifecycle defect was found and repaired: a missed order-approval webhook could leave an order attempt pending even after a verified completed capture, blocking human review. Capture confirmation now settles only its matching parent order. Existing captured records can repair this state through authenticated provider readback without another financial submission. Wrong-merchant readback is rejected.

## Passed checks

- `pnpm check`: encoding, shared packages, lint, type checks, 68 unit tests and API/Next production builds. Final touched files also passed lint/unit checks, frontend production rebuild and Docker compilation.
- `node scripts/test-integration-local.mjs`: 38 tests against isolated real PostgreSQL/Redis. External identity/PayPal boundaries use explicit test doubles. Coverage includes public/private access, listing version changes, exact snapshot prices, idempotency, correct promising party, direct bound recipients, revoked permission, wrong merchant, runtime privilege denial, immutable recipient binding, one capture, shared receipts, independent human review, refund despite seller disagreement, one refund execution and moderated verified reviews.
- Playwright: all 52 desktop/mobile browser checks passed, followed by all 4 marketplace checks after the final typography correction. New marketplace screens passed accessibility and horizontal-overflow checks. Browser provider/data fixtures are isolated test stubs.
- Python: Ruff and all 28 unit tests passed. An initial run mixed real local host configuration into the test environment and failed four host-header checks; rerunning in the intended clean test environment passed without weakening application host restrictions.
- Actual NVIDIA provider: baseline extraction, supported evidence, missing evidence, conflicting evidence and injection cases passed. A synthetic backend resume linked to its commitment returned FULFILLED with an 85% advisory deliverable match and an exact citation. No private resume was submitted in this validation pass, and no stored analysis was rewritten.
- Real PostgreSQL backup/restore passed for all 27 original tables before migration and all 30 expanded tables afterward. A separate comparison of every original data column across 26 original application tables found no changes; the migration ledger is intentionally excluded. All 38 original Pacts remain. Backups and private reports are in ignored `.recovery-local` folders.
- Both additive migrations applied successfully locally. API, web and migration Docker builds passed. All seven running services are healthy. Landing, marketplace, account/services pages, API readiness and AI health returned HTTP 200. Public catalogue returned HTTP 200; anonymous listing management returned HTTP 403.
- Hosted Compose isolation checks, patch checks and configured-secret scan passed. No real secrets were added to source. Public registration is the default when `PACT_TESTER_EMAILS` is empty; private agreement membership and staff allowlists remain enforced.

## External release gates still open

The local environment has the existing Clerk, NVIDIA and single-merchant PayPal configuration. `PAYPAL_PARTNER_MERCHANT_ID` and `PAYPAL_PARTNER_ATTRIBUTION_ID` are empty. The existing REST app has not been independently validated as an approved PayPal platform app. Real seller onboarding, platform permissions, a real connected Sandbox checkout/capture, signed cloud callback delivery and an authorized connected Sandbox refund are therefore not claimed as passed. Missing platform setup fails closed and does not redirect money to the developer merchant.

No public cloud deployment was created. Provider accounts, complete always-running cloud services, hosted Clerk registration/origins, private scanner/storage/AI connectivity, cloud database isolation and cloud end-to-end acceptance remain deployment work. The product remains Sandbox-only; production-money endpoints are disabled. See [Marketplace setup and boundaries](MARKETPLACE.md).

Automatic approval review initially rejected deleting the temporary Docker recovery copies without explicit consent. The user subsequently approved deleting those two task-created copies. Cleanup recovered about 26 GB; approximately 30.8 GB is now free. The live disks and verified Pact database backups remain intact, all seven services remain healthy, and API readiness still returns HTTP 200.

### 2026-10-24 — Signed-in usability review

- Reviewed the actual Test 3 agreement, assessment, resolution and confirmed payment receipt in the signed-in browser. The receipt records a $1,000 Sandbox capture to the legacy developer merchant; this does not establish a transfer to the agreement recipient. The latest stored assessment recognises the resume with an 85% deliverable match and explains the undefined acceptance criterion. No financial or agreement mutations were performed.
- Removed the permanent loaded-resource loading message. Missing PayPal platform configuration now explains the operator dependency and test-account distinction without disabled consent/connect controls. Direct agreements show the member-payment prerequisite before submission. Account/listing actions await their refresh. Catalogue failures support retry, search changes hide stale results, empty searches support clearing filters, and pagination cannot advance from an error. Workspace copy explains independent review and distinguishes historical failed assessment attempts from the latest result.
- Passed: pnpm check (70 tests, lint, types, encoding, API and frontend production builds); six desktop/mobile marketplace browser tests including error/retry, filters, accessibility and private-page boundaries; Docker web build and restart; all seven services healthy; local configured-secret scan (zero matches); git diff --check.
- One new browser assertion initially matched Next.js’s empty route-announcement alert as well as the intended error. Scoped the assertion to the actual error message; rerun passed all six tests. Type checking also caught a redundant narrowed status comparison, corrected before the successful full check.
- Verified the rebuilt signed-in account page shows the new setup guidance and no lingering loading message. Real partner onboarding, connected-account capture/refund, live payments and cloud deployment remain unverified and unavailable until their provider configuration/release gates are completed. This review does not certify deployment readiness.

### 2026-10-24 — Lighter shared green

Changed the primary/success green from #215C49 to #32755E and hover from #184535 to #2B6853. Updated Clerk primary controls and the design-system reference as well. Raster logo artwork is preserved. Measured contrast: 5.466:1 on white, 5.014:1 on the page background, 4.561:1 on the subtle green surface. Local configuration presence checks confirmed checkout keys/webhook exist while partner merchant and attribution settings remain missing; no credential values were printed or altered. Passed pnpm check (70 tests, lint/types/encoding, API and web builds), Python 28 tests and Ruff. No payment behavior changed.

### 2026-10-24 — Separate PayPal Platform Sandbox credentials

- Wired PAYPAL_PLATFORM_CLIENT_ID, CLIENT_SECRET, MERCHANT_ID, ATTRIBUTION_ID and WEBHOOK_ID independently of legacy PAYPAL_CLIENT_ID/SECRET/WEBHOOK_ID. Connected recipient operations use only the Platform app; legacy transactions keep the original merchant adapter. No credential fallback exists. Independent token caches and signature verification prevent mixing apps. Onboarding/revocation webhooks require Platform verification; financial events still require stored-route provider readback.
- Updated compose/Render/example configuration, readiness warnings and secret scanning. Webhook tooling supports --platform and writes only that app’s webhook entry; the restricted local relay configures both apps. Existing referral links are refreshed with a GET on the saved referral ID.
- Real Sandbox OAuth and six-event webhook registration passed for both apps, with unsigned callbacks rejected and private routes returning 404. The original Test 3 order remained readable as COMPLETED through the legacy app. The signed-in account screen now shows an enabled consent/connect flow. No consent, merchant onboarding completion, capture or refund was performed on the user’s behalf.
- Passed pnpm check (73 tests, lint/types/encoding, API/frontend builds), 38 real-database integration tests with identity/provider doubles, Docker API build/restart, all seven services healthy, hosted configuration isolation, zero configured-secret matches and git diff --check. Additional focused provider tests cover existing referral refresh. User completion of PayPal-hosted consent is pending; real connected-merchant payment/refund validation remains a release gate. Sandbox only.

### 2026-10-24 — Repair Sandbox onboarding-reference validation

The real PayPal referral ID was 112 characters and used encoded-token characters, but Pact’s retry path incorrectly enforced a 100-character identifier. Reopening onboarding therefore failed locally. The referral endpoint also returns the official api.sandbox.paypal.com alias in its self link. Updated validation to accept bounded opaque referral tokens and both explicit Sandbox API hosts, reject credentials/foreign/live URLs, preserve the whole encoded ID and URL-encode it on readback. Added regression coverage using a long padded token and the actual host alias. Unconfirmed account lookups returning PayPal 404 now produce actionable connection guidance (HTTP 409), without claiming a payment failure or marking the connection ready.

Passed pnpm check (76 tests, lint/types/encoding and production builds), 38 database integration tests, nine focused provider tests after the host-alias adjustment, API production/container rebuild and restart. Real read-only PayPal checks confirmed the saved referral matches its tracking ID and Platform account, the repaired parser accepts the actual self link, and PayPal returns a trusted onboarding action link. Actual account verification remains pending: the lookup is still unconfirmed and now produces the expected connection-specific 409. No consent or financial operation was performed on the user’s behalf.

### 2026-10-24 — Completed PayPal account connection and return guidance

The user completed Sandbox seller consent. A fresh server-side account verification returned READY with the correct Platform grant; account connection is now verified. The saved referral already contains the expected localhost Pact return URL, but PayPal rendered its own final completion page. Added the supported return_url_description (Return to Pact) to future referral requests; PayPal controls its hosted completion page, so this does not prove automatic redirection or retroactively change the completed referral. Nine provider tests, API type checking and Docker API build passed; rebuilt backend restarted. Connected seller capture/refund remains untested against real Sandbox transactions.

### 2026-10-25 — Sandbox release review and license

Added the MIT License, package license metadata, and a judge/demo guide covering local setup,
private evaluation access, AI boundaries, Sandbox financial proof and submission material.
Fresh hosted-environment setup now copies the separate Platform configuration alongside legacy
credentials without overwriting an existing private environment file.

The initial dependency audits found vulnerable Zod, body-parser, multer and pypdf versions.
Updated Zod to 4.6.6, body-parser to 2.4.0, multer to 2.5.0 and pypdf to 6.21.2, with regenerated
JavaScript lockfile and matching Python pins. Both final dependency audits report no known
vulnerabilities. This describes the audit result at review time, not a guarantee against future issues.

Passed encoding, lint, type checking, 76 unit/component tests, API/web production builds, and
format checking. All 38 isolated PostgreSQL/Redis integration tests passed with identity and
PayPal doubles. The first run timed out during one suite's shutdown under concurrent builds;
the complete rerun passed all five suites, including teardown. Desktop/mobile Playwright:
54 passed. Python: 28 tests and Ruff passed. The real NVIDIA evaluation passed extraction,
backend-resume artifact matching, supported, insufficient and conflicting evidence cases; an
unsupported adversarial numeric estimate was rejected by the assessment validator.

Real local storage/scanner checks passed immutable upload, checksum, authorized and expired
download handling, private bucket access, clean-file scanning, EICAR rejection and size limits.
Unavailable storage/scanner checks and hosted configuration isolation also passed. A fresh
local pg_dump/pg_restore drill matched row counts and content fingerprints for all 30 public
tables in a separate restore database. The original data and ignored private backup were retained.

API, web and AI container rebuilds passed; the updated services restarted with preserved volumes.
All seven long-running services are healthy. The storage/scanner checks also passed from the
rebuilt API container. Fresh read-only PayPal calls confirmed the connected member's receiving
permissions and the original legacy order's COMPLETED status. Final formatting, configured-secret
scanning and diff whitespace checks passed; private environments and recovery artifacts stay ignored.

No new checkout, capture, refund, adjudication or stored assessment was initiated for this review.
The newly connected member's actual Sandbox capture/refund cycle remains an acceptance gate;
provider-double tests and earlier legacy-merchant financial proof do not replace it. Cloud
deployment, stable HTTPS callbacks and complete hosted acceptance remain separate work.
