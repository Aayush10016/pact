# Confirmed financial records

Payment and refund receipts are private, read-only views of existing financial records.
There is no new receipt table, duplicated ID source, financial POST, or changed consent flow.

## Sources and authorization

`GET /v1/pacts/:id/receipts` lists confirmed payment/refund records.
`GET /v1/pacts/:id/receipts/:kind/:receiptId` exposes their exact receipt.
Payment receipt IDs are existing transaction UUIDs; refund receipt IDs are existing refund
operation UUIDs. Clerk verification, Pact membership, same-Pact linkage, CONFIRMED operation
state, stored order/capture IDs, and confirmation audit records gate receipt access.
Pending, failed, ambiguous, and unconfirmed requests have no completed receipt.

Order/capture IDs come from `transactions.order_id` / `transactions.capture_id`. Refund IDs
come from the confirmed REFUND operation's `paypal_transactions.paypal_id`. Amounts use that
operation's integer minor units and the transaction currency. The provider adapter performs
GET-only readback on receipt opening, checking ID, completion, amount, currency and ownership.
Payment readback also checks the order's custom transaction ID and linked capture. Confirmed
captures remain historical payment receipts after a linked refund.

Captured-at uses PayPal capture `create_time`. Refunded-at uses completed refund `update_time`,
falling back to its `create_time`. Missing provider timestamps are explicitly marked unavailable;
the exact existing confirmation-audit time is shown separately, never mislabeled as provider
execution time. No credentials, raw provider payloads, unrelated records, or payer addresses
are exposed. Pact payer/payee are agreement roles; Sandbox checkout pays the configured
developer merchant, and a refund's funding-account availability follows provider processing.

## Activity

Audit events remain append-only. User-facing labels use related stored operation/resolution
types and verified provider event types, not string guesses or current transaction state.
Historical webhook context is resolved from the webhook-received audit record in the same
confirmation transaction. New confirmation audit metadata includes the provider event type.

Only final `PAYMENT_CAPTURED`, confirmed refund `FINANCIAL_ACTION_EXECUTED`, and confirmed
capture/refund `PAYPAL_OPERATION_RECONCILED` events have receipt links. Their labels are
Payment completed / Refund completed. All initiation, submission, approval, processing,
webhook, generic state verification, rejection and review rows have no arrow. Links open
`/workspace/pacts/:id/receipts/payment/:transactionId` or
`/workspace/pacts/:id/receipts/refund/:operationId`, never Pact detail. The existing detail
timeline uses the same contextual labels. A financial-record section links both confirmed
receipts from Pact detail without changing its layout or tabs.

## Sign-in

Sign-in uses a scoped CSS module: editorial Pact message on the left, centered actual Clerk
component on the right, with a restrained shared-record sequence using the existing tokens.
At 800px and below it stacks; mobile may scroll. Desktop uses available viewport height,
readable type and controlled spacing rather than clipping or hiding authentication content.
Global CSS, navigation, fonts, logo, other pages and integration behavior are unchanged.

Reference: [approved Figma board](https://www.figma.com/design/Dj8BmtS686mqCGeCCQVDwc),
DESIGN_SYSTEM.md, existing Figma-mapped components and saved foundation variable/style
metadata. The current Figma MCP read attempt reached the Starter-plan tool-call limit;
no new Figma screen was fetched or fabricated.

## Validation boundary

Existing isolated PostgreSQL/Redis financial integration tests explicitly use external-provider
doubles; they exercise persistence, membership, same-Pact receipt linkage, verified confirmation,
duplicate capture/refund handling, stale consent, ambiguous outcomes, receipt viewing without
financial execution, and full refund rejection / one-party silence. These are software safety
tests, not proof of real PayPal money movement. Actual local Sandbox receipts are separately
validated through the real adapter's GET readback, without initiating another financial action.
UI tests check exact identifiers, amounts, currency, missing timestamps, context-specific wording
and only-final receipt arrows. Login browser tests measure the actual configured Clerk component
at 1440×900, 1366×768, 1024×768, 768×1024 and 390×844, plus keyboard focus, accessibility and
overflow. In unconfigured CI they honestly validate the setup state instead of a fake Clerk card.
