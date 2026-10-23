import { readFileSync } from 'node:fs';
import { parseArgs, parseEnv } from 'node:util';
const { values } = parseArgs({
  options: { 'env-file': { type: 'string', default: '.env.sandbox' } },
});
const env = parseEnv(readFileSync(values['env-file'], 'utf8'));
const failures = [],
  warnings = [];
for (const name of [
  'POSTGRES_PASSWORD',
  'APP_DATABASE_PASSWORD',
  'MINIO_SECRET_ACCESS_KEY',
  'MINIO_ACCESS_KEY_ID',
  'AI_SERVICE_KEY',
  'CLERK_SECRET_KEY',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_ISSUER',
  'NVIDIA_NIM_API_KEY',
  'NVIDIA_NIM_MODEL',
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'PAYPAL_WEBHOOK_ID',
])
  if (!env[name]?.trim()) failures.push(`${name} is missing`);
for (const name of [
  'POSTGRES_PASSWORD',
  'APP_DATABASE_PASSWORD',
  'MINIO_SECRET_ACCESS_KEY',
  'AI_SERVICE_KEY',
])
  if (env[name] && env[name].length < 24) failures.push(`${name} needs a strong private value`);
for (const name of ['PACT_HOST', 'PACT_FILES_HOST']) {
  const host = env[name] || '';
  if (
    !/^(?=.{1,253}$)[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(host) ||
    /(?:^|\.)(?:localhost|example\.com|example\.org|example\.net)$|\.(?:invalid|test)$/.test(host)
  )
    failures.push(`${name} needs a real hostname you control, without a scheme or path`);
}
const testers = (env.PACT_TESTER_EMAILS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
if (!testers.length || testers.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
  failures.push('PACT_TESTER_EMAILS needs the invited verified tester emails');
if (env.PACT_HOST === env.PACT_FILES_HOST)
  failures.push('Use distinct application and download hostnames');
if (env.PAYPAL_BASE_URL !== 'https://api-m.sandbox.paypal.com')
  failures.push('PAYPAL_BASE_URL must remain Sandbox');
if ((env.POSTGRES_DB || 'pact') !== 'pact' || (env.POSTGRES_USER || 'pact') !== 'pact')
  failures.push('Sandbox bootstrap uses the dedicated pact database/owner');
if ((env.EVIDENCE_STORAGE || 'minio') !== 'minio')
  failures.push('This deployment recipe uses private MinIO storage');
if (!env.PACT_OPERATOR_SUBJECTS)
  warnings.push(
    'No reconciliation operator configured; assign a verified staff subject explicitly',
  );
if (!env.PACT_REVIEWER_SUBJECTS)
  warnings.push('Human review needs a verified independent reviewer');
if (env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_'))
  warnings.push('Clerk development instance: restrict this deployment to invited testing');
console.log(
  JSON.stringify({ environment: 'sandbox', pass: failures.length === 0, failures, warnings }),
);
if (failures.length) process.exitCode = 1;
