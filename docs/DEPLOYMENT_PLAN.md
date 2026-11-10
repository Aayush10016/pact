# Pact Sandbox deployment decision

Reviewed 29 October 2026. No cloud resources have been created by this plan.
This supersedes the earlier Supabase/Render split-hosting proposal. Supabase and Northflank
are excluded at the owner's request. All payments remain PayPal Sandbox.

## Architecture selected for the existing complete feature set

- Frontend: Vercel Hobby, subject to its personal/noncommercial eligibility and quotas.
- Backend: one Linux Docker VM with persistent storage, using the existing hosted Compose recipe.
- The VM runs NestJS with its four BullMQ workers, FastAPI/Tesseract, PostgreSQL, persistent Redis,
  private MinIO, ClamAV, and the HTTPS gateway. PostgreSQL remains authoritative.
- Neon is not required for this arrangement. Existing local records are not copied automatically.
- Private services stay on the Docker network. Only the gateway and tightly restricted administration
  are exposed; evidence downloads use short-lived authenticated signatures from a private bucket.

Oracle's Always Free ARM VM is the current technical candidate, conditional on the owner accepting
card verification, account eligibility and regional capacity. Its published Always Free allocation is
currently equivalent to 2 OCPUs / 12 GB RAM and includes 200 GB total block storage. Do not substitute
paid trial resources or upgrade to Pay As You Go. A successful native ARM build, runtime checks and
measured memory/disk usage are still required. This is not a claim that the stack was deployed or
load-tested there. Free resources have no availability SLA and idle instances may be reclaimed.

**Blocking decision:** the existing no-card requirement has not been withdrawn. Therefore this
candidate is not authorized for account setup/card verification, and no complete zero-cost,
no-card host has been verified for the current stack. Image optimization does not remove that gate.

## Why Vercel alone is not the current month-long free plan

Vercel now supports Docker-packaged background Daemons in public beta on Hobby. Earlier blanket
statements that Vercel cannot run any background worker are outdated. However, Hobby permits
1 or 2 GiB daemon instances and includes 420 GB-hours of provisioned memory per month. Even one
1 GiB instance running continuously would use that allowance after about 17.5 days. Idle memory
counts, and reaching a quota stops daemons. Daemons also provide no persistent local storage or
inbound HTTP/TCP endpoint. A smaller application process does not reduce its allocated 1 GiB floor.
Changing Pact to an on-demand durable workflow could be investigated separately; it is not part
of this packaging-only optimization and is not already verified free hosting.

Render Free cannot host the whole recipe: 512 MB memory is below ClamAV's published recommended
minimum, disks are ephemeral, web services sleep, and standalone background workers are not Free.
Creating new Hugging Face Docker compute Spaces currently requires a paid plan. A service's
health URL or UptimeRobot traffic does not supply missing memory, persistent storage or capacity.

## Safe packaging optimization

The Node image uses build stages and separate production runtimes. The API carries compiled code,
production dependencies, migrations and existing diagnostic scripts; build/test dependencies stay
in the build stage. The Docker frontend uses Next.js standalone tracing, including its public logo
and static assets. Normal local/Vercel builds retain their existing configuration. The Python image
installs the runtime entrypoints constrained by the existing reviewed dependency lock, excluding
pytest/Ruff and their development-only dependencies. OCR, Pillow, PDF extraction and NVIDIA calls
remain present. Image size is distinct from running memory; no capacity claim follows from smaller
images alone. Worker concurrency, financial logic, scanning policies and UI behavior are unchanged.

Verified local image reductions: API 79.2%, web 82.0%, AI 18.4%. Production imports, worker startup,
OCR, storage/scanning and desktop/mobile browser checks passed. See docs/VALIDATION.md for exact
measurements and the distinction between packaging size and running memory requirements.

## Deployment order after the hosting gate is resolved

1. Verify the account's actual Always Free eligibility/quotas and provision only eligible VM/storage.
2. Validate native CPU/image compatibility, firewall, HTTPS names and persistent volumes. Keep secrets
   in ignored server environment configuration. Take an independent backup before retaining records.
3. Create a fresh hosted PostgreSQL database and run `node scripts/migrate.mjs` with a reviewed direct
   administrative connection. Preserve migrations 001–010 and their checksums. Provision the restricted
   `pact_runtime` LOGIN separately; never run local-only provisioning in production or use the owner
   connection as the API runtime. No reset/drop/import of the user's existing database is authorized.
4. Start private PostgreSQL, durable Redis, MinIO, ClamAV and AI. Verify private bucket creation,
   create-once writes, signatures, scanning and all service readiness before enabling API workers.
5. Start the API and workers. Configure exact public origins and a separate hosted secret set.
6. Deploy the frontend to Vercel from `apps/web` using its existing vercel.json. Configure
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `API_ORIGIN` and
   `NEXT_PUBLIC_PACT_UPLOAD_ORIGIN`. Keep database/PayPal/NVIDIA/storage keys off Vercel.
   Configure the gateway and API for the exact assigned frontend origin and test real upload CORS.
7. Update Clerk origins and register separate hosted legacy/Platform PayPal Sandbox callbacks.
   Preserve local webhook registrations and original transaction ownership. Verify signatures and
   duplicate handling. Registering a callback is not confirmation of a payment or refund.
8. Run two-member hosted acceptance: private access boundaries, upload/quarantine/malware rejection,
   OCR, cited AI advice, connected seller onboarding, confirmed Sandbox capture/shared receipt,
   independent reviewer authorization and an authorized refund/readback. Use a new designated demo
   agreement, never a financial operation against an old record just to test hosting.
9. Verify restart/job recovery, ambiguous-result reconciliation, database and evidence restore, and
   operator visibility. Then share the Sandbox URL with its tested limitations stated explicitly.

API variables and startup commands remain documented in `.env.example`, `docker-compose.yml`,
`docker-compose.sandbox.yml`, `docs/MARKETPLACE.md` and `docs/SANDBOX_DEPLOYMENT.md`.
The hosted overlay currently includes a same-host frontend; a Vercel split requires deliberate
gateway/origin configuration and is not accomplished by applying that overlay unchanged.

## Official sources

- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://www.oracle.com/cloud/free/faq/
- https://vercel.com/docs/daemons/limits
- https://vercel.com/docs/plans/hobby
- https://render.com/docs/free
- https://docs.clamav.net/manual/Installing/Docker.html
- https://huggingface.co/docs/hub/spaces-overview

See docs/VALIDATION.md for actual test results. A deployment plan and local checks are not hosted
acceptance or a guarantee of uninterrupted free service.
