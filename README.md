# Pact

**Make the commitment. Prove the work. Resolve fairly.**

Phase 3 preserves the approved interface and adds free local private storage, malware scanning,
OCR, evidence-grounded NVIDIA reasoning, operator reconciliation and recovery tooling. It is a
development product; real Sandbox capture and a full refund are now confirmed, with private
payment/refund receipts. Production readiness and real ambiguous-operation reconciliation
remain separate gates. See
[Phase 3 setup, actual provider proof and blockers](docs/PHASE_3.md).

## Run locally

Node 24.18.0, pnpm 11.20.0, Python 3.11+, and Docker Desktop are required.
Preserve an existing `.env`; copy `.env.example` only when no local environment exists.

```powershell
pnpm install --frozen-lockfile
pnpm prepare:packages
docker compose up -d --build postgres redis minio clamav ai
pnpm db:bootstrap
node scripts/minio-bootstrap.mjs
python -m venv apps/ai/.venv
apps/ai/.venv/Scripts/python -m pip install -r apps/ai/requirements.lock.txt
pnpm build
```

Run `pnpm dev:web` and `pnpm dev:api` separately. API scripts load the root environment.
For the AI service, from repository root, load the same environment without printing secrets:

```powershell
node --env-file=.env -e "require('node:child_process').spawn('apps/ai/.venv/Scripts/python',['-m','uvicorn','pact_ai.main:app','--app-dir','apps/ai','--host','127.0.0.1','--port','8000'],{stdio:'inherit',env:process.env})"
```

Web: http://localhost:3000, API readiness: http://localhost:4000/ready, AI: http://localhost:8000/health.
Use the exact WEB_ORIGIN for Clerk session authorized-party validation.
All services: `docker compose up --build --wait`. Existing database volumes are preserved.
PostgreSQL host port is 55432. Migration credentials own schema changes; `pact_runtime`
has restricted column-level writes and cannot alter audit/approval records or evidence content.
Local role provisioning refuses production mode and databases other than explicitly named development databases.

## Private workspace

- Verified Clerk identity; email-matched invitation and agreement review before acceptance.
- Persistent Pacts, commitments, optional milestones, party-neutral payer selection, integer money.
- Private MinIO/R2 uploads, immutable versions, ClamAV quarantine, bounded document/OCR extraction.
- NVIDIA NIM Nemotron assessment with structured claims, citations, uncertainty and missing evidence.
- Explicit, equal-weight approval/rejection for an exact version and financial consequence.
- PayPal Sandbox orders, capture and full/partial refunds; verified webhooks confirm financial state.
- PostgreSQL outbox, BullMQ retries, safe request IDs, append-only audit, per-user budgets.

`/preview` preserves clearly labeled Phase 1 sample screens. `/workspace` uses real records;
unconfigured identity/providers stay unavailable. PNG/JPEG supports bounded local Tesseract OCR.
URL evidence ingestion is disabled. Confidence is a bounded model estimate,
not empirically calibrated. Inference cannot approve or execute financial actions.

## Configuration and validation

See [Phase 2 setup and live gates](docs/PHASE_2.md), [security](SECURITY.md),
[architecture](ARCHITECTURE.md), [design](DESIGN_SYSTEM.md), and [validation](docs/VALIDATION.md).
See [capture and Unicode investigation](docs/PAYPAL_CAPTURE_REPAIR.md) for the
merchant-switch failure, preserved original order, refresh repair, and real-test boundaries.
See [confirmed receipts, Activity semantics and sign-in](docs/FINANCIAL_RECEIPTS.md) for
authoritative ID sources, private receipt routes and focused product completion.

```sh
pnpm format:check
pnpm encoding:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
```

Integration tests require DATABASE_URL pointing to a bootstrapped restricted runtime role and
REDIS_URL. Use `node scripts/test-integration-local.mjs` with the separate `pact_phase3_tests`
database and Redis DB 3 locally; tests insert synthetic records
and never delete user data. CI uses an isolated database. Provider doubles exist only inside tests;
they are not a runtime fallback or evidence of live provider success.
Python: `apps/ai/.venv/Scripts/python -m ruff check apps/ai` and
`apps/ai/.venv/Scripts/python -m pytest apps/ai`.

**AI understands. AI recommends. Humans authorize. PayPal executes.**
