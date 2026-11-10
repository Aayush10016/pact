# Phase 2 / configuration and release gates

Implementation and local provider-contract tests are available. Phase 2 release is NOT complete
until both live lifecycle scenarios below are observed with real accounts and receipts.
Never put provider credentials in Git, screenshots, CI logs, or browser bundles.

## Provider setup

1. Clerk: configure secret and public keys from the same application, exact HTTPS CLERK_ISSUER
   (bare issuer without path), and allowed origin matching WEB_ORIGIN. Configure Next.js sign-in
   and sign-up. Create two distinct test users with verified primary emails. The server verifies
   RS256 signature, issuer, expiry, not-before, authorized party, session ID, and pending status,
   then resolves verified email from Clerk. JWT content alone cannot establish invitation ownership.
2. Cloudflare R2: create a private bucket with public access/r2.dev disabled. Set account ID,
   access key, secret key and bucket name. Restrict credentials to this bucket. Do not use a public
   evidence CDN. Downloads are authorized against Pact membership and expire after 120 seconds.
3. NVIDIA: set NIM key and an available `nvidia/...nemotron...` model. The official endpoint is
   `https://integrate.api.nvidia.com/v1`. Set a strong random AI_SERVICE_KEY identically for API
   and AI. There is no silent fallback. PDF/DOCX parsing runs in a bounded child process; images
   remain human review only. Uploaded instructions are untrusted data, not application policy.
4. PayPal Sandbox: configure a Sandbox merchant REST application, client ID/secret, and registered
   webhook ID. Use only `https://api-m.sandbox.paypal.com`. Create a separate Sandbox buyer account.
   Register a public HTTPS callback ending `/v1/webhooks/paypal`; localhost cannot receive PayPal
   delivery. Subscribe to CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.COMPLETED and
   PAYMENT.CAPTURE.REFUNDED. Never reuse live credentials. Return/cancel pages cannot confirm money.
5. Enable workers with WORKERS_ENABLED=true, Redis and a restricted PostgreSQL runtime role.
   Redis must be private. API, AI and database URLs must be internal/private in deployment.
   Docker readiness verifies dependencies; it does not certify third-party configuration.

The Sandbox merchant receives a capture. Pact does not provide escrow or platform custody.
PayPal fees/account eligibility and permitted use need separate production review.

## Live happy path (required, not yet verified)

Sign in as A and create a Pact with clear criteria and B's verified email. B reviews all terms and
accepts. The selected payer creates an order, follows PayPal's approval URL using a Sandbox buyer,
then explicitly requests capture. Wait for a verified capture webhook and CAPTURED state.
Upload genuine text/document evidence, wait for extraction, request real Nemotron reasoning,
and inspect exact citations. Create a NO_ACTION proposal with its explicit consequence. Both
users review and approve the exact hash/version. Execute agreement completion; confirm Pact
COMPLETED and an audit trail while the captured amount remains unchanged.

## Live dispute path (required, not yet verified)

Create/accept another Pact and complete the real Sandbox capture. Upload partial delivery
and contradictory/missing evidence. Request real Nemotron reasoning; confirm claims are distinct
from inference. Open a dispute. Propose a full/partial refund. Verify the exact amount and currency.
Test rejection, then create a fresh version and collect both users' explicit approval.
Execute once; API acceptance must not change confirmed money. Observe the signed, officially
verified webhook, provider readback, exact refund amount, RESOLVED state and audit entry.
Repeat execute and replay the same webhook; prove no second refund or duplicate accounting.

Record provider order/capture/refund IDs and event IDs in a private validation report. Do not
publish personal data, secrets, signed download URLs or complete webhook payloads.

## Required negative cases

Wrong-user Pact/read/upload/download/invitation/approval; foreign evidence association;
changed evidence or proposal after approvals; missing/rejected consent; simultaneous execute;
fake webhook; provider timeout; malformed NIM output; prompt injection; oversized/spoofed files;
expired session; database/Redis failure. Local tests cover key boundaries, but live sessions,
private R2 behavior and actual provider delivery still require credentials and network access.

## Operational limits and Phase 3

Ambiguous remote outcomes become NEEDS_RECONCILIATION and block another financial proposal.
Automatic remote reconciliation, an operator dashboard, notifications/invitation email delivery,
malware scanner, image OCR, empirically calibrated confidence/evaluation suite, retention/deletion,
backup restore drills, error-monitoring integration and production financial review remain work.
No URL ingestion, real-money mode, AI financial tools or auto-approval is enabled.
PAYMENT.CAPTURE.DENIED is retained/ignored rather than a confirmed state mutation; add explicit
provider-confirmed failure reconciliation before production. Do not manually overwrite financial state.
