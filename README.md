# Pact

**Make the commitment. Prove the work. Resolve fairly.**

Pact is a trust layer for transactions between people who don't know each other.
Commitments -> evidence -> fulfillment -> payment -> resolution.

This repository is the **Phase 1 foundation**, not a public financial product. It contains a real
Next.js application, NestJS REST service, separate FastAPI skeleton, relational migration,
Redis/BullMQ contracts, local Docker environment, CI, and a shared visual system.

## Get running

Requirements: Node **24.18.0** (>=24.15 <25), pnpm **11.20.0**, Python **3.11+**, Docker Desktop
with its Linux engine running. Framework packages are pinned and `pnpm-lock.yaml` is committed.

```powershell
Copy-Item .env.example .env
pnpm install --frozen-lockfile
pnpm prepare:packages
pnpm --filter @pact/api build
docker compose up -d postgres redis
pnpm db:migrate
python -m venv apps/ai/.venv
apps/ai/.venv/Scripts/python -m pip install -r apps/ai/requirements.lock.txt
```

Run in separate terminals from the repository root:

```powershell
pnpm dev:web
pnpm dev:api
```

Run the AI service from `apps/ai`:

```powershell
.venv/Scripts/python -m uvicorn pact_ai.main:app --host 127.0.0.1 --port 8000
```

Web: http://localhost:3000 Â· API: http://localhost:4000/health Â·
Infrastructure readiness: http://localhost:4000/ready Â· AI docs: http://localhost:8000/docs.
The API watch script watches compiled output; rebuild the API after source edits.
On macOS/Linux use `.venv/bin/python` instead of `Scripts/python`.

For all services in containers:

```sh
docker compose up --build --wait
```

Migrations run before the API starts. Restarting does not erase volumes or recreate tables.
Do not change an applied migration; add a new numbered SQL migration.
PostgreSQL uses host port 55432 to avoid the Windows-reserved 5432 port.
The Docker setup is for local development: loopback ports, disposable credentials, non-root
app users. Use managed services, strong credentials, TLS, and service-to-service identity for deployment.

## Validation

```sh
pnpm check
pnpm db:migrate
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e
```

From `apps/ai`: `.venv/Scripts/python -m ruff check .` and `.venv/Scripts/python -m pytest`.
Integration tests require the root `.env` values loaded into the shell; CI supplies its own variables.
PowerShell: `$env:DATABASE_URL='postgresql://pact:pact_local_only@localhost:55432/pact'` and
`$env:REDIS_URL='redis://localhost:6379'`.
See [validation report](docs/VALIDATION.md) for the actual results of this bootstrap.

## What is implemented

- `/`: responsive branded landing page.
- `/workspace`: explicitly labeled sample pacts, filters, search, next action, and activity.
- `/workspace/new`: boundary-validated draft stored only in the current browser tab session.
- `/workspace/pacts/:id`: commitment, evidence, assessment, and resolution views.
- NestJS: health/readiness, sample REST resources, draft validation, centralized safe errors.
- FastAPI: health, provider capabilities, strict schemas, provider protocol. Assessment requests
  deliberately return **501**; providers do not make external calls.
- Financial route returns **403** even with a bearer token. The PayPal adapter is disabled.

Authentication, live business persistence, object uploads, reasoning, OCR, and payment execution
are intentionally not implemented. The frontend uses shared sample fixtures; it does not imply
that backend records, accounts, or payments exist.

## Architecture and design

`apps/web` â†’ authorized `apps/api` â†’ internal `apps/ai`; PostgreSQL is the source of truth.
Redis supports jobs, never the authoritative financial state. Evidence bodies belong in R2.

**AI understands. AI recommends. Humans authorize. PayPal executes.**

- [Product scope](PACT_SPEC.md)
- [Architecture and entity relationships](ARCHITECTURE.md)
- [Security boundary](SECURITY.md)
- [Design system](DESIGN_SYSTEM.md)
- [Contributor workflow](CONTRIBUTING.md)
- [Phase 2 plan](docs/PHASE_2.md)
- [Official references](docs/REFERENCES.md)
- [Figma identity and product layouts](https://www.figma.com/design/Dj8BmtS686mqCGeCCQVDwc)

The brand pairs Source Serif 4 with Manrope and IBM Plex Mono. Warm paper, forest green,
copper, semantic status text, square-edged records, and modest 6px control radii keep the
interface human and precise. Fonts are packaged locally: builds require no Google Fonts request.

Docker host ports can be overridden with WEB_PORT, API_HOST_PORT, and AI_PORT when local services already occupy the defaults.
