# Render + Supabase + Vercel Sandbox

This is deployment preparation for the user-selected split architecture. No public deployment has passed acceptance. A new email does not increase a service's memory, filesystem persistence or worker capabilities. Use provider-approved account/workspace allocations; never duplicate accounts to circumvent limits.

## Readiness gates

The Render definition contains only the API. The user must supply independent cloud-hosted Redis, FastAPI, private evidence storage and a privately reachable ClamAV scanner before the complete app can work with the laptop off. The API worker remains enabled; no payment/scan protection is disabled to make an incomplete deployment look healthy. Do not expose unauthenticated ClamAV TCP on the public internet. Render free web services cannot receive private-network traffic; an external scanner needs a suitable private network or an authenticated encrypted transport implementation, neither configured by this recipe. A URL pointing to localhost or a tunnel on the developer PC does not satisfy independent hosting.

The free scanner-memory/transport plan is unresolved. Render also shares 750 running hours across free web services in a workspace. Two continuously running services exceed that allowance in a typical month. Uptime monitoring is not extra capacity or an availability guarantee. No uptime monitor is created by this recipe.

## Supabase Free database

Use a new, dedicated Free project, not a database already used by another application. Published limits include 500 MB database, 1 GB storage, 5 GB egress and inactivity pausing; this is a bounded free Sandbox, not unlimited hosting. Do not upgrade or enable paid add-ons.

Before applying migrations, **disable Supabase's Data API for this dedicated database**. Pact's public-schema tables rely on its NestJS authorization and restricted runtime grants, not Supabase browser RLS policies. Do not expose them via anonymous/authenticated Supabase REST or GraphQL. Verify that anonymous Data API access is unavailable before and after migration. Never give the frontend a database owner URL, service-role key or S3 secret.

Obtain the connection details from the dashboard. Prefer a session-mode pooler where IPv4 is needed; direct connections depend on the host's IPv6 support. Use the provider's custom-role connection format for `pact_runtime`, not the postgres owner. Retain certificate validation; use the provider CA and verified TLS configuration rather than `rejectUnauthorized:false`. Test actual authentication and `current_user` before starting private workflows. The app checks the restricted role and refuses an owner connection.

Run the existing checksum-protected migrations against the explicitly reviewed new project only, from a trusted administrative environment. The migration identity stays out of Render and Vercel. Existing local provisioning deliberately refuses cloud targets; do not remove that guard. A database administrator must provision LOGIN/password for `pact_runtime` through the cloud provider's supported role management and verify grants. Supabase restricted-superuser compatibility has not been tested yet. Do not edit applied migrations.

No local data migration is performed. Take a backup and plan any later transfer separately. Hosted backups and restore verification remain required before retaining meaningful records.

## Vercel website

Import the reviewed Pact branch as a Next.js project with **Root Directory `apps/web`**, enable access to monorepo files outside that directory, and use Node 24.x. `apps/web/vercel.json` installs the workspace lockfile and builds shared packages before Next.js. Use only a personal noncommercial Sandbox eligible for Hobby.

Configure only `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and server-only `API_ORIGIN=https://YOUR_API.onrender.com` as required by the app. No PostgreSQL, Redis, NVIDIA, PayPal or storage secret belongs on the frontend host. Add the exact assigned HTTPS origin to the Clerk configuration and Render `WEB_ORIGIN`. Set an explicit tester allowlist on the API before inviting users.

**Hosted uploads:** Vercel functions limit payloads to 4.5 MB, while Pact permits 8 MB files. Set build-time public `NEXT_PUBLIC_PACT_UPLOAD_ORIGIN=https://YOUR_API.onrender.com` to send only multipart evidence-create/version POSTs directly to the authenticated NestJS upload endpoint. The same Clerk Bearer identity, membership checks, size/type checks, quarantine and scanning apply. Financial calls and normal requests retain the existing Next.js proxy. The origin must be HTTPS without credentials, path, query or fragment; invalid configuration fails before sending the request. Leave it unset locally to preserve existing behavior. Configure Render CORS for the exact Vercel origin and verify real preflight, cross-user denial and an 8 MB upload against both deployed hosts before accepting the feature. The public origin is a hostname, never a secret. Nothing in `vercel.json` increases the platform's body limit.

## Render API

Use root `render.yaml` or create its Free Docker web service manually if the dashboard requires a payment method for Blueprint setup. Never accept a paid plan as fallback. Root Docker context and Dockerfile are specified. Port 10000 is explicit; code also accepts platform `PORT` while preserving `API_PORT` precedence. Existing local defaults remain unchanged. The hosted configuration accepts TLS `rediss://` URLs, which the queue runtime already supports.

Supply runtime-only database credentials and the required integration variables through the provider's secret settings; `sync:false` means user configuration, not a committed credential. Use the existing PayPal Sandbox app, never a live endpoint. Keep NVIDIA credentials exclusively in the separate AI service. No `MIGRATION_DATABASE_URL` is passed to Render. Do not use a paid predeploy/shell feature: administer migrations separately before the API starts.

The blueprint uses the existing S3-compatible adapter variable names as a contract, not proof Supabase Storage works unchanged. Supabase's S3 protocol does not support bucket versioning; create-once PUT behavior, private signatures, checksum verification, quarantine, recovery and deletion must pass an actual integration test before choosing that adapter. Do not run the local MinIO bootstrap against Supabase.

The `/ready` check is necessary but not sufficient: inspect capabilities and perform actual upload, scan, extraction, advisory assessment, both-party access, human-review authorization, approved Sandbox checkout/capture, signed webhook delivery and verified receipt tests. Never fabricate missing provider results. Do not send a new capture or refund against an existing Pact merely to test hosting.

Once the API has its final URL and works, register its exact HTTPS Sandbox webhook using the existing registration tool and securely update only the hosted webhook ID. Keep separate local and hosted registrations. Verify unsigned calls fail and actual signed deliveries reconcile idempotently. Frontend redeployment, cloud restarts and sleep/recovery must not create duplicate financial requests.

## Current status and sources

Only configuration/source preparation exists. Account access, Supabase role/TLS compatibility, cloud scanner/AI/queue/storage, cross-origin upload acceptance and signed-in hosted acceptance are incomplete. No paid resource was created.

- https://render.com/docs/free
- https://render.com/docs/blueprint-spec
- https://supabase.com/pricing
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/storage/s3/compatibility
- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/functions/limitations
