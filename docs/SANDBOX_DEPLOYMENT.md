# Hosted Sandbox deployment

This recipe publishes an invite-only evaluation environment. PayPal remains Sandbox-only; no live-money endpoint is enabled. NVIDIA trial access is for testing/evaluation. It is not a production marketplace release or escrow. The local development command remains unchanged.

## What is prepared

`docker-compose.sandbox.yml` overlays the local Compose file, uses a separate `pact-sandbox` project and volumes, removes every application/dependency host port, and publishes only gateway ports 80 and 443. The pinned Caddy gateway obtains and renews TLS certificates once real DNS points to the server. The app and download endpoints use distinct hostnames.

Only the exact POST `/v1/webhooks/paypal` backend route is public. Other `/v1/` routes return 404. Normal authenticated API calls use the Next.js proxy. The file hostname permits only GET/HEAD within the evidence bucket; S3 signatures remain mandatory. Uploads and administrative paths are blocked there. AI, PostgreSQL, Redis, ClamAV and MinIO stay inside the Docker network. Logs rotate and services restart after host restarts. Never expose Docker's administrative API.

## Hosting inputs still needed

Choose a Linux Docker host with persistent disk and enough memory for the complete stack, especially ClamAV and builds. Start with about 8 GB for this all-in-one test recipe and measure actual usage before increasing test traffic. This is a sizing starting point, not a capacity guarantee. Configure firewall access to 80/443 and tightly restrict administrative SSH access. Create two DNS names, for example a staging name and a files name, pointing to that host. No paid resource is created by this repository.

Keep the environment invite-only. Review the Clerk instance's allowed domains/origins, issuer and sign-in redirects for the exact HTTPS application origin. A development Clerk instance remains a testing boundary; do not advertise this as production authentication. Establish at least two verified test users and a third independent reviewer for dispute acceptance tests. Staff subjects must be explicitly assigned; setup never grants operator privileges automatically.

## Prepare private configuration

On the existing development machine:

```sh
node scripts/setup-sandbox-env.mjs
```

This creates an ignored `.env.sandbox`, preserves existing files, copies existing integration settings locally without printing them, and creates different random infrastructure/service credentials. Fill `PACT_HOST` and `PACT_FILES_HOST` with bare hostnames, and `PACT_TESTER_EMAILS` with the comma-separated verified emails of the invited testers. The API checks this list after identity verification and before inserting/reading private records; it does not grant staff roles. Existing local database/evidence volumes are never copied or renamed. The hosted stack starts with an empty database. Transfer the environment file securely to the chosen host; never paste keys into chat, commit it, or put it in a public artifact. Restrict file access to its owner.

```sh
chmod 600 .env.sandbox
node scripts/check-sandbox-env.mjs --env-file .env.sandbox
```

The check verifies configuration shape and secret presence, not account entitlement, DNS ownership, connectivity or a successful deployment. Resolve its errors and review its staff/identity warnings. Reusing Sandbox integration keys is possible for this invited test environment; separate provider test apps can be used later for stronger environment isolation. Never move an existing order to another merchant by changing its keys.

## Start on the chosen host

Use Docker Compose 2.24.4 or later for port-reset support. Clone the intended reviewed commit and install Docker. The commands below must use both Compose files and the explicit private environment file:

```sh
docker compose --env-file .env.sandbox -f docker-compose.yml -f docker-compose.sandbox.yml config --quiet
docker compose --env-file .env.sandbox -f docker-compose.yml -f docker-compose.sandbox.yml up -d --build --wait --wait-timeout 600
docker compose --env-file .env.sandbox -f docker-compose.yml -f docker-compose.sandbox.yml exec -T api node scripts/minio-bootstrap.mjs
```

The migration service runs before the API with the owner identity; the API uses restricted `pact_runtime`. This named development database bootstrap is appropriate to this dedicated Sandbox recipe, not a general production-role provisioning tool. Confirm all eight long-running services are healthy/running and the HTTPS app loads. The gateway does not currently define a Docker healthcheck; separately probe HTTPS. Confirm signed evidence downloads through the files hostname, never by making the bucket public.

A blank/example domain cannot obtain a public certificate. Local gateway tests validate routing and signatures but do not prove public DNS, certificate issuance or host firewall configuration. Keep the local `.env` separate from the server `.env.sandbox`.

## Register the stable Sandbox webhook

After HTTPS is reachable, run from a trusted machine with repository dependencies installed and access to the private `.env.sandbox`:

```sh
node scripts/register-paypal-webhook.mjs --env-file .env.sandbox --url https://YOUR_APP_HOST/v1/webhooks/paypal
```

The registration tool verifies private-route denial and unsigned callback rejection before changing Sandbox configuration. It reuses an existing registration for the same URL and stores the verified webhook ID only in the specified private environment file. Securely sync that updated file to the server, then recreate the API during a safe idle period:

```sh
docker compose --env-file .env.sandbox -f docker-compose.yml -f docker-compose.sandbox.yml up -d --no-deps api
```

Do not restart a worker while a financial request is executing. Registration/reachability is not proof of actual signed delivery; complete the acceptance flow below. Keep a local temporary relay separate: `pnpm sandbox:webhooks` verifies and reconnects its temporary URL, reuses the current local registration instead of accumulating stale hooks, and must remain running. It exposes only the restricted webhook relay. It is not the hosted deployment's permanent endpoint.

## Acceptance gates

- Real login by two distinct verified test users; email-matched invitation accepted only by its intended member; outsider/private reads denied.
- Create/accept a Pact, upload a clean artifact, reject malware/oversize files, verify immutable versions and signed/expired downloads, request a cited advisory assessment from both members.
- Sandbox buyer approves one checkout; capture occurs once; verified provider confirmation and shared receipts match PayPal facts. Test refresh, retries, missing browser return and unavailable webhook recovery without creating duplicate charges.
- Test voluntary no-action/full/partial resolution and an independent reviewer contacting both parties, private thread isolation, evidence access, a documented decision and exactly one Sandbox refund. Neither party can adjudicate its own case. Confirm the final shared refund receipt through provider readback.
- Test concurrent clicks/tabs, stale versions, AI queue/rate limits and provider failures. The assessment worker already serializes processing and limits starts to four per minute across its queue; each user also has a ten-per-hour request budget. These application budgets are not a guarantee of NVIDIA capacity.
- Check verified-review eligibility/privacy, independent moderation, audit continuity and retained case reasons. Configure a reconciliation operator explicitly before relying on that recovery function.

Automated financial tests use provider doubles. No new charge/refund is issued merely by deployment preparation. Real hosted acceptance tests still need the invited humans and their Sandbox buyer accounts.

## Backups, operations and updates

Schedule private encrypted off-host PostgreSQL backups and evidence-volume/object backups on the chosen host. Keep TLS data and private configuration recoverable. Monitor disk space, failed jobs, scanning readiness and financial attempts needing reconciliation. The local recovery drill discovers and compares every public table, including cases, messages, decisions, reviews and future additive tables; its archive is restored into a fresh database without overwriting the source. Its script is local-only and must not be represented as a hosted backup scheduler. A host operator must configure and test the hosted schedule/restore destination.

Before deploying an update, take backups, pause new test activity and check financial execution is idle. Build/recreate the app during a maintenance window; do not run an old image after an incompatible forward migration. Migrations are additive and checksum protected. Test an actual restore and the agreed recovery time before inviting wider testing. Never use `down --volumes` as routine troubleshooting, and do not restore private local data into a public environment implicitly.

## Local validation commands

```sh
pnpm check
pnpm format:check
pnpm audit --audit-level low
node scripts/test-sandbox-config.mjs
node scripts/test-integration-local.mjs
pnpm test:e2e
```

Run browser tests after image builds and resource-intensive checks finish, and report initial failures and any retries separately. Preserve `.env`, local volumes, existing payment facts and stored assessments throughout validation. Consult `docs/VALIDATION.md` for actual results and remaining hosted gates.

## Zero-budget hosting with the development PC off

As checked on 2026-10-23, Oracle Always Free is a candidate for running this entire stack independently of the developer PC. This is a candidate, not an existing deployment or uptime guarantee. The account owner must complete identity/card verification themselves. Oracle may place a temporary card authorization hold; its FAQ says this is usually removed in three to five days. Do not upgrade to Pay As You Go or choose paid substitutes. Trial credits expire and are not the budget for this deployment.

1. Create or use the owner's single Oracle Free Tier account. Choose the home region carefully: Always Free compute must be there and capacity may be unavailable.
2. Before creating anything, confirm the console's current free eligibility and estimate. The documented A1 allowance is **2 OCPUs and 12 GB total**, with **200 GB total block storage** across boot/data volumes. A single A1 Flex host at those compute limits with a 50–100 GB boot volume is the proposed starting configuration, subject to the console showing no cost. Do not follow older 4-OCPU/24-GB tutorials.
3. Use an Arm64 Linux OS supported by Docker. The hosted overlay pins the official ClamAV Debian multiarchitecture image because the local Alpine image is AMD64-only. Its registry manifest includes Arm64; a complete native Arm deployment still must pass host acceptance checks.
4. If free capacity is unavailable, wait or check another availability domain in the same home region. Do not silently provision a paid shape. Oracle can reclaim idle instances; do not generate fake load to evade that policy. Free hosting has no availability SLA.
5. Arrange two DNS names under an owned domain or an appropriate free DNS provider before setting up Caddy. No domain purchase is required by this recipe, and no hostname has been allocated yet. Review free DNS terms/availability before choosing one.
6. Restrict SSH to the administrator's address and open only HTTP/HTTPS publicly. Transfer private configuration securely, run the preflight, then follow the deployment and acceptance steps above. Do not paste card details, passwords, private SSH keys or provider secrets into chat.

Official references: [Always Free limits and capacity](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [Free Tier verification and availability FAQ](https://www.oracle.com/cloud/free/faq/), [account signup](https://signup.cloud.oracle.com/).

The independent host, DNS, public TLS, signed webhook acceptance, hosted restore drill and both-user/reviewer acceptance remain outstanding. Do not describe the local tunnel as a PC-independent deployment.

## Card-free constraint (latest user preference)

The user prefers no card verification, so Oracle signup is paused. No provider account or hosting resource has been created. Northflank's current pricing page advertises a no-card, always-on Sandbox with two services, two jobs, one database and up to $20/month of resources. However, its billing documentation still says a payment method is required to create resources. Treat this conflict as unresolved until the owner's dashboard confirms no-card resource creation; stop if it requests a card. Do not claim the complete Pact stack fits the allowance: the existing recipe has more services, and scanner memory plus persistent private storage/queues need a measured deployment design.

Render explicitly offers no-card free web services, but free services sleep and have no persistent disk; free Postgres expires after 30 days and free dedicated background workers are unavailable. It is a candidate for a limited preview or part of a redesigned split deployment, not a drop-in persistent financial Sandbox. Hugging Face currently requires a paid plan to create Docker compute Spaces, so it is not a verified free fallback. No protections or records have been removed to fit a free plan.

Sources checked 2026-10-23: [Northflank pricing](https://northflank.com/pricing), [Northflank billing documentation](https://northflank.com/docs/v1/application/billing/pricing-on-northflank), [Render free limits](https://render.com/docs/free), [Render no-card web-service guidance](https://render.com/articles/hosting-n8n-on-render-for-llm-powered-automation), [Hugging Face Spaces requirements](https://huggingface.co/docs/hub/spaces-overview).
