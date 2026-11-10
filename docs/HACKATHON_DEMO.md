# Pact / judge and demo guide

Pact combines PayPal Sandbox payment records with evidence-grounded AI advice and human
resolution. The app is a working prototype, not an escrow service or a live-money marketplace.
The repository includes its original source under the MIT License.

## Run the working build

Follow the root README's local setup with Node 24, pnpm 11, Python 3.11+ and Docker. Use
`docker compose up --build --wait` for the full stack. A website-only deployment does not run
the backend, queues, scanner or AI service. See `docs/PHASE_3.md` for detailed setup.

Create a private root `.env` from `.env.example`. The local setup script generates missing
infrastructure credentials; it does not invent provider credentials. Configure a Clerk instance
and its exact local web origin, a supported NVIDIA NIM API key/model, the legacy PayPal
Sandbox app and a separate Platform Sandbox app. Private keys must never be committed or
included in a public demo video. A reviewer testing independently must configure their own
provider access or obtain dedicated evaluation access privately from the project owner.

Use two distinct verified Pact identities for the agreement and a third independent,
server-authorized reviewer for human adjudication. `PACT_TESTER_EMAILS` may be blank for
public verified registration; it does not assign reviewer or operator authority. Account signup
and consent to an individual agreement are separate actions.

## Recommended demonstration

1. Sign in, offer a service, and request it using a second account. Review and accept the
   immutable agreement terms. Direct agreements are also supported.
2. Upload a clean synthetic document as evidence. Wait for quarantine, scanning and extraction.
   Request an advisory assessment and show its evidence citation, deliverable fit and uncertainty.
3. Connect the receiving member's Sandbox account through PayPal's own permission screens.
   The buyer approves a checkout using a different Sandbox buyer account. A browser approval
   alone is not a payment receipt: show the verified capture and shared receipt.
4. Show the resolution reason and independent human review. The reviewer hears each side in
   separate private conversations, records a decision, and may authorize a Sandbox refund.
   Show the confirmed refund receipt after provider readback, not just a submitted request.
5. Show that both members see the same outcome and an unrelated account cannot read the
   agreement, evidence, private conversations or receipts.

Use new, explicitly designated Sandbox demo agreements. Do not recapture or refund existing
records merely to record a video. The legacy developer-merchant test route and the newer
connected-member route have distinct recipients and credentials; do not present one as the other.

## Tools and boundaries

- Next.js frontend, NestJS API, PostgreSQL, Redis/BullMQ and private S3-compatible storage.
- FastAPI extraction and NVIDIA NIM reasoning: structured evidence assessment, citations and
  explicit limitations. A match estimate is not a calibrated success probability or financial approval.
- ClamAV quarantine gates document processing and downloads.
- PayPal Sandbox: account onboarding, merchant-bound checkout/capture, refund, signed events,
  readback and immutable financial records. Test funds only.
- Clerk verifies identity; public registration grants no staff role.

See `docs/VALIDATION.md` for dated checks and their limits. Provider-double integration tests
verify application rules but are not evidence that a particular PayPal transaction happened.
Actual provider confirmation is required for each financial receipt.

## Submission material

Provide a project description, the public source repository with LICENSE, complete judge-access
instructions, and a public YouTube demonstration under three minutes. A hosted URL is optional
when the working build can be run using complete instructions. Do not include private API keys
in public instructions. Review the official event requirements before final submission:
https://paypalaihackathon.devpost.com/rules.
