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

Phase 1 ships independent working services and contracts, not connected business flows.
Public HTTP reads are explicit sample resources. Private mutation routes fail closed.
The AI skeleton can never reach a payment adapter and has no financial credential configuration.
Only NestJS will own authorized financial mutations in later phases.

## Monorepo

- apps/web: App Router pages and interaction components; sample fixtures from shared.
- apps/api: health, auth, pacts, and payments modules; jobs define stable queue contracts.
- apps/ai: Pydantic schemas, provider protocol, HTTP skeleton and provider validation.
- packages/types: strict wire schemas and TypeScript interfaces.
- packages/shared: sample fixtures, amount formatting, state machine and approval rules.
- packages/config: TypeScript defaults. No distributed monolith or premature Turborepo.

## Relational model

users 1→N parties N→1 pacts; each Pact has one buyer and one seller (unique role).
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
Phase 2 must enforce same-Pact ownership for all cross-entity references, authenticated party
membership, immutable evidence versions, and least-privilege DB roles before enabling writes.
Evidence snapshot arrays require ownership/FK validation in transactional services.

## State and authorization

CREATED → AUTHORIZED → CAPTURED → COMPLETED, or CAPTURED → DISPUTED →
RESOLUTION_PROPOSED → AWAITING_APPROVAL → ACTION_AUTHORIZED → ACTION_EXECUTING → COMPLETED/FAILED.
Terminal states have no outgoing transition. Invalid edges throw. ACTION_AUTHORIZED requires
both distinct parties to approve the same resolution. These pure helpers are not permission
tokens: production orchestration must derive their input from locked persisted records.

## Jobs and consistency (Phase 2)

Use transactional outbox records to connect DB changes to BullMQ. Queue job IDs derive from
immutable evidence-version IDs or verified persisted webhook-event IDs. Workers are retryable.
Verify webhook signatures before publishing trusted jobs. Atomically claim event processing;
update payment state and audit in one transaction. Never mark a financial action completed from
an AI response or a browser callback. PayPal webhook/reconciliation confirms final state.

For financial execution lock the transaction, re-check approval and resolution version, store a
unique idempotency key, call PayPal with a stable request ID, and reconcile ambiguous outcomes.
Do not hold a DB transaction open through a long remote call; use an outbox and explicit states.

## Deployment

Next.js on Vercel; NestJS and FastAPI on Railway or equivalent; managed PostgreSQL and Redis;
R2 for private evidence. No Kubernetes. Internal AI routes require service identity and network
restriction before deployment. Add pgvector only after retrieval demonstrates a need.
Structured backend startup logs use Nest's JSON logger. Sentry is a documented Phase 2 integration;
the empty environment placeholder does not imply active telemetry.
