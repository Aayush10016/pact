# Marketplace and connected accounts

One verified Pact identity can buy services, offer services, and create direct agreements. There is no permanent buyer/seller signup choice. Agreement roles and payment roles are set for each Pact. Human reviewer authority remains a separate server-assigned permission; public signup never grants it.

## Available flows

- `/marketplace` provides public, paginated search by service, category and professional name. Published listings expose only service terms, display name, connected-account status and moderated verified-review aggregates. Drafts, email addresses, merchant identifiers, private cases and evidence remain private.
- `/workspace/services` lets a verified member create, edit, publish or unpublish up to 50 listings. Prices use integer minor units. Concurrent edits require the current listing version.
- Requesting a service creates a private Pact with a permanent snapshot of the listing version, terms, price and delivery period. The receiving professional owns the deliverable commitment. They must accept the Pact before payment or work tracking begins; delivery dates start at acceptance. Later listing edits do not alter existing agreements. Request keys prevent duplicate agreements.
- `/workspace/new` offers an explicit connected-PayPal option. Its separate endpoint verifies and binds the actual recipient before saving. That recipient needs an existing verified Pact identity and completed PayPal connection. The old developer-merchant Sandbox flow remains explicitly labelled for existing tests; old financial records are never reassigned.
- `/workspace/account` starts PayPal's own onboarding and refreshes its server-verified status. Pact does not collect a member's PayPal password or API secret. Browser callback flags do not establish identity, permissions or payment success.

## PayPal setup and actual release gate

Keep `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com`. The current product remains Sandbox-only. Preserve the existing `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `PAYPAL_WEBHOOK_ID` for legacy payments. Configure the separate Platform app using `PAYPAL_PLATFORM_CLIENT_ID`, `PAYPAL_PLATFORM_CLIENT_SECRET`, `PAYPAL_PLATFORM_MERCHANT_ID`, `PAYPAL_PLATFORM_ATTRIBUTION_ID` (BN code) and `PAYPAL_PLATFORM_WEBHOOK_ID`. There is no fallback between these credential sets. OAuth caches, merchant assertions and webhook signature checks use their own app credentials. Sandbox platform testing can precede live approval; live processing still requires PayPal approval. Standard single-merchant credentials alone do not establish platform onboarding permission.

`node scripts/register-paypal-webhook.mjs --platform --url <restricted-HTTPS-webhook-URL>` registers the Platform app’s callback and writes only its webhook setting to the ignored environment file. The local `pnpm sandbox:webhooks` helper configures both apps on its restricted relay when platform credentials are present. Merchant onboarding and consent-revoked events require a signature verified specifically with the Platform app. Existing financial events remain tied to their stored transaction route and provider readback. Reopening incomplete onboarding refreshes its existing referral link because PayPal links expire after use.

PayPal requires partner approval for live platform use; Sandbox testing can precede live approval. See [onboarding before payment](https://developer.paypal.com/platforms/seller-onboarding/before-payment) and [platform checkout](https://developer.paypal.com/platforms/checkout/standard/integrate). Availability depends on PayPal's account, country and product eligibility. Public Pact signup does not remove those restrictions.

Register `MERCHANT.ONBOARDING.COMPLETED` and `MERCHANT.PARTNER-CONSENT.REVOKED` alongside the existing payment events. The registration helper includes both. After signed onboarding events, Pact reads merchant integration status from PayPal. It checks the durable tracking ID, platform client grant, confirmed email, receiving eligibility and payment/refund scopes. Revocation blocks new payments, and payment workers recheck permissions before provider submission.

New marketplace payments cannot fall back to the developer merchant. Before the first order, the receiving party and their verified merchant ID are bound to the transaction. Purpose-specific SQL functions check actor, party role, active agreement and recent verification without granting general payment-recipient update access to the runtime role. Recipient binding becomes immutable; subsequent checkout, capture, receipts, refunds and reconciliation use that merchant context. Existing legacy transactions retain their original context.

Provider approval, actual member onboarding, one real Sandbox checkout/capture, webhook delivery, and a controlled authorized Sandbox refund remain external acceptance gates. Isolated provider-double tests do not satisfy those gates. No production money endpoints are enabled. Pact is not escrow and cannot guarantee PayPal will execute a refund after permissions are revoked or funds become unavailable; staff must explain provider failures and use PayPal's supported escalation paths.

## Signup, AI, receipts and human review

For public registration, leave `PACT_TESTER_EMAILS` empty and enable public registration in the Clerk instance. Every API identity still needs a cryptographically verified session and a verified primary email. Individual Pact acceptance is consent to that agreement, not admission to the application.

Marketplace agreements use the existing private evidence/scanner, grounded NVIDIA advisory assessment, confirmation-based financial receipts, human-review conversations and verified transaction reviews. AI can recommend; it cannot capture, refund or authorize an outcome. Staff accounts do not need a personal PayPal account to review cases. Reviewers must be explicitly assigned and independent of both parties. Both sides have separate case conversations, and any staff refund decision requires the existing immutable reason, evidence snapshot and worker authorization checks.

Migrations 009 and 010 are additive. Do not rewrite applied migrations. Keep the database runtime role restricted and disable Supabase's public Data API before using this private schema there. Hosting still needs API/worker, private AI, scanner, object storage, Redis and PostgreSQL; deploying the website alone does not run the complete application.
