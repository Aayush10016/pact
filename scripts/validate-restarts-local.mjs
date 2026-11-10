import pg from 'pg';
import { spawnSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
process.loadEnvFile('.env');
const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/pact')
  throw new Error('Local Pact only');
const tables = [
  'pacts',
  'parties',
  'commitments',
  'evidence',
  'evidence_versions',
  'resolutions',
  'approvals',
  'transactions',
  'paypal_transactions',
  'paypal_webhook_events',
  'audit_events',
  'reconciliation_reviews',
];
async function snapshot() {
  const db = new pg.Client({ connectionString: url.href });
  await db.connect();
  try {
    const result = {};
    for (const table of tables) {
      const key = table === 'reconciliation_reviews' ? 'request_id' : 'id';
      result[table] = (await db.query(`SELECT ${key}::text AS id FROM ${table}`)).rows.map(
        (r) => r.id,
      );
    }
    return result;
  } finally {
    await db.end();
  }
}
async function ready() {
  try {
    return (await fetch('http://localhost:4000/ready', { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}
if (!(await ready())) throw new Error('Start API before restart validation');
const before = await snapshot();
const restart = spawnSync(
  'docker',
  ['--context', 'desktop-linux', 'compose', 'restart', 'postgres', 'redis'],
  { stdio: 'ignore', timeout: 30000 },
);
if (restart.status !== 0) throw new Error('Restart failed');
for (let n = 0; n < 20 && !(await ready()); n++) await setTimeout(1500);
if (!(await ready())) throw new Error('API did not recover after dependency restart');
const after = await snapshot();
const preserved = tables.every((t) => before[t].every((id) => after[t].includes(id)));
console.log(
  JSON.stringify({
    postgresRestart: 'PASS',
    redisRestart: 'PASS',
    apiReconnected: true,
    originalRowsPreserved: preserved,
    tables: tables.length,
  }),
);
if (!preserved) process.exitCode = 1;
