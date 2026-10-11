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
