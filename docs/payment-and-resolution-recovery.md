# Payment confirmation and shared resolution

A completed PayPal Sandbox capture pays the configured developer merchant. It does not route funds to the other Pact member or provide escrow. The confirmed payment receipt identifies the actual PayPal merchant separately from the agreement recipient.

## Confirmation recovery

A capture response remains PROVIDER_ACCEPTED until verified webhook processing or audited official provider readback confirms it. The local webhook tunnel must be running and reachable; closing it or restarting Windows stops delivery. Payment status polling performs bounded confirmation checks, and Refresh record also offers recovery.

POST /v1/pacts/:id/payment/refresh is available to either authenticated member. It only reads an existing CAPTURE or consented REFUND operation with a persisted provider ID and an originally authorized member. It never creates orders, captures, or refunds. Before confirming, it validates PayPal capture completion, order intent/status/linkage, transaction ownership, amount and currency. The commit checks operation status and transaction version under row locks. Refund readback additionally revalidates both members approvals on the exact current resolution. Member recovery cannot access the operator reconciliation API or reconcile orders. Concurrent or mismatched results fail closed. Zero is a legitimate initial transaction version.

Receipts are shared member records based on confirmed operations and immutable confirmation audit events. Receipt viewing still independently reads PayPal and validates its facts. Approval, processing, and provider submission never create a false completed receipt.

## Evidence assessment

The immutable request snapshot includes the application's evidence-to-commitment association. A supplied artifact may itself satisfy the requested deliverable; a resume must not be rejected for lacking internal UUIDs or creation provenance unless those requirements were expressly agreed. Relevant role content and actual acceptance criteria still need cited support. Generic percentages without a rubric cannot justify an exact completion score. Confidence describes the advisory judgment, not work completion.

Provider errors and invalid output cannot authorize financial action. The latest failed/pending request is distinguished from an earlier completed assessment. Exhausted job failure is recorded before the worker returns its final failure.

## Resolution requests

Requesting resolution requires a concern of 10–2000 characters and records it for both members. The UI calls the state Resolution requested; the durable internal status remains DISPUTED. Either member can add context, evidence and request another assessment. The request does not open a PayPal dispute or reverse money.

After capture confirmation, either member may propose retaining the payment, a partial refund or a full refund. Both distinct members must approve the exact current proposal, amount, version and evidence snapshot. Rejection leaves review open; revising retires earlier decisions. Only explicit execution after both approvals can submit a refund. An agreed no-action outcome closes the Pact without moving money. Earlier requests without reasons are labeled honestly, never backfilled with invented explanations.
