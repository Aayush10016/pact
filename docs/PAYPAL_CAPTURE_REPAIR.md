# Capture and Unicode repair

## Real failure and preserved records

The affected Pact is `680cedce-65c4-4422-83a2-861cc0694c94`, with transaction
`5be724cb-3196-42b4-847e-bd0cff5c7153`, amount `500000` minor units / `5000.00 USD`.
Its existing order is `1BS69878FP869812W`.

The capture request reached NestJS through the Next.js proxy. Before queuing any
capture, `ResolutionService.payment()` called PayPal's order readback. OAuth
succeeded, but the US app received `404 RESOURCE_NOT_FOUND / INVALID_RESOURCE_ID`.
The adapter discarded the provider diagnostics and threw a plain `ProviderError`;
the global filter consequently returned an opaque HTTP 500. No CAPTURE operation
was created and no capture POST was sent by these failed requests.

The user confirmed that the order had been created with the Indian merchant app
before changing to US app credentials. A read-only check with the restored original
app returned HTTP 200, `APPROVED`, intent `CAPTURE`, the exact transaction custom ID,
one purchase unit for `5000.00 USD`, a merchant payee, and no captures. Changing app
credentials does not change the existing order's merchant. The original record and
order were retained; no financial state was rewritten and no volumes were deleted.
The US credentials were restored and the tunnel callback was registered/reused
against that app. Neither credentials nor webhook identifiers are recorded here.

The fixed adapter retains only bounded machine identifiers and HTTP status, requests
full representations, and handles malformed OAuth/order responses safely. The HTTP
filter returns a useful HTTP 503 for provider failures and logs only safe diagnostics.
Preflight failures are audited with Pact, actor, and order references. Existing capture
operations are returned before new provider calls, including after confirmation.
Amount, currency, intent, order ID, and single-unit transaction ownership are checked
before capture. An approved order receives one POST with its durable request ID,
followed by a GET. An already completed order uses GET only. Failed readback after a
POST stays uncertain and requires reconciliation; worker retries never reissue it.
Redirects and capture responses still cannot confirm money. Verified webhooks or
explicit operator reconciliation remain required.

## Unicode root cause

PostgreSQL server and client encodings were both UTF8. The real party names were
intact. The two live components introduced by Phase 2 commit `3f5245a` contained
literal UTF-8 replacement characters (`EF BF BD`): five in `draft-form.tsx` and seven
in `pact-detail.tsx`. The corruption was already present in those committed strings,
rather than introduced by database retrieval or browser JSON decoding. All other
tracked text files decoded as valid UTF-8 without replacement characters.

Only the twelve identified source characters were repaired: curly apostrophes,
ellipses, and the middle-dot separators used by the approved preview. No user data or
legitimate question mark was replaced. Global CSS, fonts, layout, logo, and tabs are
unchanged. `.editorconfig` specifies UTF-8; `pnpm encoding:check` rejects invalid
UTF-8 and literal replacement characters in tracked source/docs, including in CI.
API error JSON explicitly declares UTF-8. The existing JSON/proxy path preserves
Unicode bytes. No lossy ASCII/Latin-1 conversion was found in these rendering paths.

## Merchant app changes and stale checkout recovery

The follow-up report used the same original Pact and Indian-app order. The US app's
OAuth succeeded, but official order readback still returned 404. The user confirmed
PayPal showed approval only, with no completed payment receipt. There was no new
US order in the local record and no CAPTURE operation queued for the old order.

Previously, requesting checkout again returned the saved ORDER operation and its
old approval link without checking which app could access it. Both checkout reuse
and capture now perform authenticated payer-only official order readback before
continuing. An inaccessible stored order returns a specific 409 conflict with
`PAYPAL_ORDER_UNAVAILABLE`, rather than a misleading general 503 outage. Other
provider outages and uncertain financial results retain 503 and reconciliation.
The UI removes the stale link, blocks capture, offers a new Pact form, and allows
rechecking the existing order after restoring the original app. It does not replace
orders, erase history, issue a second financial operation, or mark approval paid.

For the current US merchant, verify that the old checkout has no completed payment,
create one new Pact, obtain both parties' acceptance, and create its checkout before
approving it at PayPal. The real payer then requests capture on that new Pact. A
buyer account's country does not change the merchant app that created an order.

## Refresh feedback

Refresh already sent uncached authenticated GET requests. In the failure case the
server still returned the unchanged CREATED payment because capture had never been
queued; the button supplied no progress or success feedback. It now awaits actual
record/capability requests, refreshes the displayed operation where present, shows
progress and server-confirmed completion, and reports failures. Resource generations
prevent older responses from overwriting newer data. Payment clicks also have an
immediate in-flight guard; the durable server operation remains authoritative.

## Validation boundaries

Deterministic payment tests use explicit provider/identity doubles in test modules
with isolated real PostgreSQL/Redis. They do not prove real PayPal capture. Unicode
tests exercise international names and punctuation through PostgreSQL/HTTP JSON,
actual React detail rendering, and the browser draft; legitimate `?` characters are
preserved. Responsive screenshots and accessibility checks cover the approved
preview and configured sign-in at 1440, 768, and 390 pixels.

Real OAuth, original-order readback, US app webhook registration, tunnel isolation,
and unsigned-event rejection passed. Real capture and its signed webhook remain
pending the user's one new US merchant checkout. After the user signed in as Aayush,
the actual private Pact was inspected across all four tabs: the party names and
middle-dot separators rendered correctly, no replacement characters appeared, and
Refresh Record visibly completed a real server reload. The private creation form
also rendered the repaired apostrophes and legitimate question labels correctly.
Do not interpret old test webhook receipts as evidence for either real order.

Local checks: 41 unit/frontend tests, 19 PostgreSQL/Redis integration tests, and 19
Python tests passed. Lint, TypeScript, formatting, production build, UTF-8 source
check, configured-secret check, dependency audit, Docker configuration/health, and
native frontend/API readiness passed. Twelve responsive accessibility/overflow
checks passed. The browser suite initially exposed an unconfigured-Clerk-only
assumption, then hit three 30-second browser startup/accessibility timeouts under
load; the identity test now validates both configurations. Final browser results are
recorded in the task handoff. The final serial run passed 22 of 24; its two mobile
timeouts passed on a focused rerun (6.5 and 4.8 seconds). All 24 distinct browser
checks passed across those runs; this is not a claim that the first full run passed.

For credentials changed during native local development, rebuild then restart the
API process that loads root `.env`; restart the frontend if its configuration changed.
For a containerized API, recreate that service with `docker compose up -d --build
--force-recreate api` rather than merely restarting its existing container. Verify
health and the configured app's readback before authorizing capture. Never use
`docker compose down -v`, reset PostgreSQL, or replace an inaccessible order blindly.
