# Pact / security

**AI understands. AI recommends. Humans authorize. PayPal executes.**

## Current boundary

Only authenticated Pact members can read private records or evidence. Clerk tokens are verified
cryptographically and verified primary email is resolved server-side. A Redis budget protects
verified-user requests; unavailable infrastructure fails closed. Membership and same-Pact links
are checked in SQL. Client identity, approvals, monetary amounts and AI recommendations do not
establish authority.

Evidence uses bounded uploads, MIME/header validation, random immutable private object keys,
checksums and authorized expiring attachment downloads. PDF/DOCX stay quarantined until bounded
extraction succeeds. No links are fetched from evidence. Image OCR and malware scanning are not
implemented. Parser limits do not replace a production malware scanner.

Both distinct members approve an exact current proposal hash/version and evidence snapshot.
A revision invalidates consent; in-flight financial execution blocks revisions. Integer money is
computed on the server. Immutable SQL triggers and runtime privileges prevent alteration of
approval, audit and evidence content. Provider request IDs are durable and unique.

Only the Sandbox adapter owns PayPal credentials. Verified webhook receipts are deduplicated;
provider readback checks relationship, amount and currency before confirmed state changes.
Fake/unverified events cannot enter the financial inbox. AI receives no financial credentials,
treats evidence as data, and returns strict citations/uncertainty; it cannot call payment tools.

Live provider/credential lifecycle validation is outstanding. No production-money claim is made.

## Security review checklist

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
