import { it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
function check(changes: Record<string, string>) {
  const directory = mkdtempSync(join(tmpdir(), 'pact-sandbox-env-'));
  if (!directory.startsWith(join(tmpdir(), 'pact-sandbox-env-')))
    throw new Error('Unexpected test directory');
  const file = join(directory, 'private.env');
  const secret = randomBytes(32).toString('hex');
  const values = {
    PACT_HOST: 'staging.pact-validation.dev',
    PACT_TESTER_EMAILS: 'tester@example.com',
    PACT_FILES_HOST: 'files.pact-validation.dev',
    POSTGRES_PASSWORD: secret,
    APP_DATABASE_PASSWORD: secret,
    MINIO_ACCESS_KEY_ID: secret,
    MINIO_SECRET_ACCESS_KEY: secret,
    AI_SERVICE_KEY: secret,
    CLERK_SECRET_KEY: secret,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_' + secret,
    CLERK_ISSUER: 'https://identity.pact-validation.dev',
    NVIDIA_NIM_API_KEY: secret,
    NVIDIA_NIM_MODEL: 'nvidia/nemotron-test',
    PAYPAL_CLIENT_ID: secret,
    PAYPAL_CLIENT_SECRET: secret,
    PAYPAL_WEBHOOK_ID: secret,
    PAYPAL_BASE_URL: 'https://api-m.sandbox.paypal.com',
    ...changes,
  };
  const original = Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  writeFileSync(file, original);
  try {
    const result = spawnSync(
      process.execPath,
      ['scripts/check-sandbox-env.mjs', '--env-file', file],
      { encoding: 'utf8' },
    );
    expect(readFileSync(file, 'utf8')).toBe(original);
    expect(result.stdout).not.toContain(secret);
    return { status: result.status, report: JSON.parse(result.stdout) };
  } finally {
    rmSync(resolve(directory), { recursive: true, force: true });
  }
}
it('accepts private Sandbox settings without printing keys or changing the file', () => {
  const { status, report } = check({});
  expect(status).toBe(0);
  expect(report.pass).toBe(true);
});
it('rejects a live PayPal endpoint', () => {
  const { status, report } = check({ PAYPAL_BASE_URL: 'https://api-m.paypal.com' });
  expect(status).toBe(1);
  expect(report.failures).toContain('PAYPAL_BASE_URL must remain Sandbox');
});
it('rejects missing secrets and weak service identity', () => {
  const { status, report } = check({ PAYPAL_CLIENT_SECRET: '', AI_SERVICE_KEY: 'short' });
  expect(status).toBe(1);
  expect(report.failures).toContain('PAYPAL_CLIENT_SECRET is missing');
  expect(report.failures).toContain('AI_SERVICE_KEY needs a strong private value');
});
it('rejects placeholder, path and shared hostnames before deployment', () => {
  expect(check({ PACT_HOST: 'staging.example.com' }).status).toBe(1);
  expect(check({ PACT_HOST: 'https://staging.pact-validation.dev/path' }).status).toBe(1);
  expect(check({ PACT_FILES_HOST: 'staging.pact-validation.dev' }).status).toBe(1);
});
