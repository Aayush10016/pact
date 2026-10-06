# Contributing

Read the product, architecture, security and design docs. Keep changes scoped and explain the
concrete before/after behavior. For financial work include failure/retry and unauthorized-path tests.

Use Node 24.18, pnpm 11.20, Python 3.11+. Install frozen dependencies, build shared packages,
then run the validation commands in README. Python dependencies use exact direct version pins.
Commit the pnpm lockfile when dependencies change. Create branches with `codex/` prefix.

Do not edit deployed/applied migrations; add the next numbered file. Document every external
integration's identity, retry, and error semantics. Never commit `.env`, evidence files or credentials.
Avoid meaningless tests that mirror CSS. Test domain rules, provider contracts, and user decisions.

Run lint, strict type checks, unit/service tests and builds for relevant changes. Browser tests
cover key workflows and accessibility on desktop and mobile. Infrastructure tests require live
PostgreSQL and Redis; CI supplies both. Record limitations instead of claiming unrun checks pass.
