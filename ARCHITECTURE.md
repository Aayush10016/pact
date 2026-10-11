# Pact / architecture

## Runtime boundaries

```
Next.js web → NestJS modular monolith → FastAPI evidence reasoning
                        ↓                       ↓
                   PostgreSQL             AIProvider protocol
                        ↓                 NvidiaNim / OpenAI
                   Redis / BullMQ
                        ↓
                  Background workers
```

Phase 2 connects the services. Next.js uses a bounded, allowlisted backend proxy and a Clerk
session token. NestJS alone authorizes Pact membership and financial commands. PostgreSQL is
the source of truth; Redis/BullMQ transports durable outbox jobs. FastAPI receives only evidence
and service identity, with no PayPal credentials or financial tools.

## Monorepo

- apps/web: approved visual system, live private workspace and separately labeled design preview.
- apps/api: verified identity, persistent lifecycle, evidence, advisory requests, consent and Sandbox payments.
- apps/ai: bounded extraction, AIProvider protocol, NVIDIA Nemotron and strict grounded output.
- packages/types: shared strict wire schemas and lifecycle records.
- packages/shared: integer-money formatting, domain rules and isolated preview fixtures.
- infrastructure/docker/migrations: additive checksum-protected migrations 001 through 005.

## Phase 2 data and jobs

002 adds verified identities, PARTY_A/PARTY_B, invitations, terms, idempotent creation,
commitment criteria, lifecycle versions, approval hashes, provider attempts and durable outbox.
003 adds evidence request deduplication and immutable proposal contents. 004 adds unique remote
order/capture IDs and webhook processing results. 005 grants a separate restricted runtime role.
Provider-attempt budget storage is reserved; current assessment budgets use audit events.

Four BullMQ queues process evidence extraction, advisory inference, financial operations and
verified webhook reconciliation. Stable job/provider IDs and transactional outbox publication
handle retries. Remote financial calls occur after a locked server-side approval/state recheck;
in-flight execution prevents proposal/evidence changes. An accepted provider call is not confirmed
money. Verified events plus official readback establish amount, currency and transaction ownership.
Ambiguous results block further action and require reconciliation.

## Relational model

users 1→N parties N→1 pacts; each Pact has PARTY_A and PARTY_B (unique role), with a separate payer role.
pacts 1→N commitments 1→N milestones. pacts 1→N transactions.
pacts 1→N evidence 1→N evidence_versions; evidence optionally references a commitment.
pacts 1→N claims, ai_analyses, resolutions, audit_events.
ai_analyses record provider/model/schema version and the exact evidence-version snapshot.
resolutions reference an analysis, hold a version, and have approvals by users.
transactions 1→N paypal_transactions; PayPal request IDs and external IDs are unique.
paypal_webhook_events enforce one provider event identity with verification and processing state.
users 1→N notifications. Large content lives in object storage, only metadata in PostgreSQL.

The initial migration defines these tables, FK constraints, amount/currency checks, chronology
indexes, and an append-only audit trigger. It is a baseline, not a complete production schema.
Additive Phase 2 migrations and transactional services enforce same-Pact references, authenticated
party membership, immutable evidence content and restricted runtime writes.
Evidence snapshot arrays require ownership/FK validation in transactional services.

## State and authorization

Pact state is separate from money: CREATED becomes ACTIVE after counterparty acceptance;
ACTIVE can become DISPUTED; an agreed no-action outcome becomes COMPLETED, and a verified
refund resolves a dispute to RESOLVED. Cancellation is blocked once financial execution begins.
Transitions require current persisted Pact versions.

Money progresses through CREATED, AUTHORIZED and CAPTURED only from verified provider facts.
Refund confirmation records refunded minor units and COMPLETED money state. A no-action
resolution leaves CAPTURED money unchanged. Durable attempt states (QUEUED, EXECUTING,
PROVIDER_ACCEPTED, CONFIRMED, FAILED, CANCELLED, NEEDS_RECONCILIATION) describe operation
progress, not authoritative money. The original Phase 1 pure domain helpers remain for their
contract tests; live orchestration reads locked persisted identity, proposal and approval records.

## Jobs and consistency (Phase 2)

Use transactional outbox records to connect DB changes to BullMQ. Queue job IDs are stable outbox UUIDs; deduplication keys refer to
immutable evidence-version IDs or verified persisted webhook-event IDs. Workers are retryable.
Verify webhook signatures before publishing trusted jobs. Atomically claim event processing;
update payment state and audit in one transaction. Never mark a financial action completed from
an AI response or a browser callback. PayPal webhook/reconciliation confirms final state.

For financial execution lock the transaction, re-check approval and resolution version, store a
unique idempotency key, call PayPal with a stable request ID, and reconcile ambiguous outcomes.
Do not hold a DB transaction open through a long remote call; use an outbox and explicit states.

## Deployment

Phase 3 uses local Docker PostgreSQL/Redis/MinIO/ClamAV and free Tesseract OCR. EvidenceStorage
retains R2 and selects MinIO for local validation. CLEAN scan state gates extraction, download
and assessment. Ambiguous financial operations are never reissued by workers; audited allowlisted
operator reconciliation uses provider GET readback and locked current consent/version checks.
See [Phase 3 setup and release gates](docs/PHASE_3.md). The deployment alternatives below are
future options and are not required or provisioned for the free local product.

Next.js on Vercel; NestJS and FastAPI on Railway or equivalent; managed PostgreSQL and Redis;
R2 for private evidence. No Kubernetes. Internal AI routes require service identity and network
restriction before deployment. Add pgvector only after retrieval demonstrates a need.
Structured backend startup logs use Nest's JSON logger. Sentry remains an unimplemented monitoring integration;
the empty environment placeholder does not imply active telemetry.

## Human review extension

The user-authorized continuation adds a separate staff adjudication path. Verified, server-allowlisted reviewers can decide a refund after hearing both parties without seller approval. Immutable staff decisions, exact financial amounts and evidence snapshots are rechecked by the worker; AI has no authority. Existing mutual resolutions keep their two-party consent boundary. Migration 008 adds private cases/messages, immutable decisions and verified seller reviews. See [Human review workflow](docs/HUMAN_REVIEW.md).
