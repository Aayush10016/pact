# Phase 2 / readiness plan

Implement in dependency order without restructuring the foundation:

1. Clerk identity verification, authenticated party membership, authorization/IDOR tests.
2. Persistent Pact/commitment/milestone APIs, optimistic versioning, transactional audit writes.
3. R2 private evidence upload/download, immutable versions, MIME/size checks, scan queue.
4. NVIDIA NIM/Nemotron via AIProvider; schema validation, exact citations, prompts treating
   evidence as untrusted, timeout/retry/usage controls, provider contract tests.
5. Versioned claims/resolutions and both-party approval, with stale-version rejection.
6. PayPal Sandbox adapter behind authorization; stable request IDs, persisted attempts,
   verified and idempotent webhook inbox, outbox jobs and reconciliation.
7. Sentry/redaction, audit integrity roles, backups, CSP, rate limits, deployment review.
8. Full end-to-end sandbox test: promise → evidence → recommendation → human approval →
   authorized PayPal action → verified webhook → state/audit confirmation.

The PayPal negative path is required: an AI recommendation without human approvals must
never result in a provider call. Approval helpers are pure domain checks, not proof of identity.
No complete dispute process, production OCR, or real-money execution is in Phase 1.
