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

The pnpm monorepo separates `apps/web`, `apps/api`, `apps/ai`, and shared types/domain/config packages. The intended boundary is web → authenticated API → internal AI. PostgreSQL owns authoritative records; Redis/BullMQ runs jobs. Private R2 evidence storage is reserved for Phase 2.

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
