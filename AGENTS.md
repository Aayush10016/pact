# Working on Pact

Read PACT_SPEC.md, ARCHITECTURE.md, SECURITY.md, and DESIGN_SYSTEM.md before changing behavior.
Preserve the Phase 1 scope unless the user explicitly requests a later phase.

* Use strict TypeScript, unknown at boundaries, Zod/Pydantic schemas, and small domain modules.
* Use PostgreSQL for authoritative records, Redis/BullMQ for jobs, R2 for evidence objects.
* Never couple financial adapters to AI providers. No AI output constitutes authorization.
* Verify persisted identity, party ownership, resolution version, approval, idempotency, and
  transaction state before any later financial mutation. Webhooks require signature verification.
* Keep secrets out of code, logs, screenshots, and commits. `.env.example` contains placeholders.
* Keep sample UI clearly labeled; do not fabricate real metrics or claim provider integrations work.
* Maintain Figma/code token parity. Use semantic HTML, visible focus, contrast, and real mobile layouts.
* Validate with `pnpm check`, Python lint/tests, relevant browser checks, and infrastructure tests
  when Docker is available. Record unrun checks honestly; never replace an integration test with a mock.
* Do not edit applied migrations. Append numbered migrations and retain checksums.
* GitHub creation/push is allowed ONLY after verifying the active account is exactly Aayush10016.
  A different account, ambiguous auth, or inaccessible GitHub means local work only.
