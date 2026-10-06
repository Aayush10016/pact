# Pact / security

**AI understands. AI recommends. Humans authorize. PayPal executes.**

## Current boundary

Phase 1 executes no payment, refund, release, cancellation, webhook processing, file upload,
or vendor inference. The payment adapter throws; the private route rejects requests with 403.
No user identity is accepted from a fake token. Assessment endpoints return 501.
The foundation is not ready to handle real financial or personal evidence data.

Zod and Pydantic reject extra output fields and invalid confidence/refund ranges. Both
assessment boundaries reject citations that do not belong to the request's evidence snapshot.
Unit/HTTP tests cover illegal state transitions and unauthorized financial execution.

## Threats to address before Phase 2

- Clerk JWT verification (issuer/audience/expiry), party authorization, session handling and rate limiting.
- Cross-Pact IDOR checks on every evidence, approval, transaction, and resolution association.
- Resolution version changes invalidate previous approvals. Derive approvals from locked server records.
- Payment requests need stable idempotency keys, durable attempts, reconciliation, and verified webhooks.
- PayPal signature verification must use official APIs/certificate requirements; unverified events cannot
  change state. Persist receipts once, retry safely, and distinguish received from processed.
- Prompt injection in evidence: treat content as untrusted data; constrain output; require exact citations.
  AI cannot invoke financial tools and should never receive PayPal credentials.
- Uploads: private R2 buckets, signed short-lived URLs, size/type validation, malware scan,
  immutable hash/version records, no server-side arbitrary URL fetch without SSRF controls.
- Privacy: redact credentials, bodies, financial identifiers and personal evidence from logs/errors.
  Add retention/deletion policies and consent before accepting production evidence.
- Deployment: TLS, CSP, scoped CORS, mature auth, least-privilege database roles, backup restores,
  monitoring, dependency review, service authentication, and network-isolated AI.

## Secrets

`.env` is ignored. `.env.example` contains empty integration fields and clearly disposable local
database credentials. Never reuse those defaults in deployment. Frontend public variables must
never contain private keys. Docker contexts exclude env files. CI needs no real integrations.
The AI container receives no PayPal secrets; the API currently reads only infrastructure config.

## Reporting

Do not put credentials or private evidence in a public issue. Report through the repository
owner's private GitHub channel. No dedicated security email has been provisioned yet.
