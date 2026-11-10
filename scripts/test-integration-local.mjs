import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if (existsSync('.env')) process.loadEnvFile('.env');
const runtime = new URL(process.env.DATABASE_URL);
const owner = new URL(process.env.MIGRATION_DATABASE_URL);
if (
  !['localhost', '127.0.0.1'].includes(runtime.hostname) ||
  !['localhost', '127.0.0.1'].includes(owner.hostname)
)
  throw new Error('Local test databases only.');
runtime.pathname = '/pact_phase3_tests';
owner.pathname = '/pact_phase3_tests';
const redis = new URL(process.env.REDIS_URL);
redis.pathname = '/3';
const env = {
  ...process.env,
  DATABASE_URL: runtime.href,
  MIGRATION_DATABASE_URL: owner.href,
  REDIS_URL: redis.href,
  WORKERS_ENABLED: 'true',
};
const migrated = spawnSync(process.execPath, ['scripts/bootstrap-local.mjs'], {
  env,
  stdio: 'inherit',
});
if (migrated.status !== 0) throw new Error('Test schema setup failed.');
const result = spawnSync(
  process.execPath,
  ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.integration.config.ts'],
  { env, stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
