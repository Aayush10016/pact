# Pact / product specification

Pact is a trust layer for transactions between people who don’t know each other.
It connects promises to evidence, fulfillment, payments, and fair resolution. Its official name is Pact.

The user journey asks: what was promised, what happened, what evidence exists, what it supports,
what is recommended, what humans decided, and what PayPal confirmed.

## Phase 1 acceptance

Reproducible monorepo; Next.js frontend; modular NestJS backend; FastAPI provider skeleton;
PostgreSQL migration; Redis/BullMQ contracts and integration check; Docker; GitHub Actions;
shared types; design tokens; responsive branded UI; purposeful documentation and safety tests.

Sample screens cover landing, dashboard, draft creation, Pact detail, evidence chronology,
assessment empty state, resolution approval boundary, and activity. They are navigable and
accessible. Sample financial amounts and identities are always illustrative. Drafting saves
to sessionStorage only and sends no invitations. No actual assessment is generated.

## Deferred

Complete Clerk authentication, durable business APIs, PayPal orders/capture/refunds/disputes,
verified webhook workers, production NVIDIA NIM/Nemotron inference, OCR, R2 uploads,
and the complete end-to-end transaction lifecycle belong to later phases.
Do not imply escrow, legal adjudication, automated money control, or guaranteed outcomes.

## Domain

A Pact relates two parties to commitments, milestones, evidence versions, claims,
assessments, resolutions, approvals, transactions, notifications, and an audit history.
Record contradictions and missing evidence rather than hiding them behind confidence scores.
An assessment is advisory. A resolution is versioned. Any material change requires fresh approval.
Money uses integer minor units with explicit currency; Phase 1 currencies all have two decimals.

## Product language

Use calm, specific, balanced language. Prefer “Needs resolution” to assigning blame.
Use “No assessment generated” to a fabricated result. Show status in text as well as color.

## Phase 2 continuation

The earlier sections record the approved foundation scope. Phase 2 now connects verified
identity, persistent agreements, private evidence, advisory NVIDIA Nemotron reasoning,
versioned human decisions and PayPal Sandbox. The approved frontend identity is preserved.
Pact lifecycle, payment confirmation and financial attempt progress are separate states.
There is no auto-approval, AI financial authority, public evidence bucket or production money mode.
External credentials and the real happy/dispute lifecycle validation remain required release
gates; implemented adapters and isolated provider-contract tests do not satisfy those gates.
See docs/PHASE_2.md and docs/VALIDATION.md for actual behavior, configuration and limits.

## Human review extension

The user-authorized continuation adds a separate staff adjudication path. Verified, server-allowlisted reviewers can decide a refund after hearing both parties without seller approval. Immutable staff decisions, exact financial amounts and evidence snapshots are rechecked by the worker; AI has no authority. Existing mutual resolutions keep their two-party consent boundary. Migration 008 adds private cases/messages, immutable decisions and verified seller reviews. See [Human review workflow](docs/HUMAN_REVIEW.md).
