import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import pg from 'pg';
process.loadEnvFile('.env');
const owner = new URL(process.env.MIGRATION_DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(owner.hostname) || owner.pathname !== '/pact')
  throw new Error('This drill only reads the local Pact development database.');
const directory = resolve(process.argv[2] || '.recovery-local');
mkdirSync(directory, { recursive: true });
const restoredName = 'pact_restore_' + Date.now();
const backup = join(directory, 'pact-' + Date.now() + '.dump');
function docker(args) {
  const result = spawnSync('docker', ['--context', 'desktop-linux', ...args], {
    encoding: 'utf8',
    timeout: 120000,
  });
  if (result.status !== 0) throw new Error('Recovery Docker step failed: ' + args[0]);
  return result.stdout.trim();
}
const admin = new pg.Client({ connectionString: owner.href });
await admin.connect();
const tables = (
  await admin.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
).rows.map((row) => row.tablename);
async function snapshot(client) {
  const result = {};
  for (const table of tables) {
    const r = (
      await client.query(
        `SELECT count(*)::int AS count,md5(COALESCE(string_agg(row_to_json(t)::text,'' ORDER BY row_to_json(t)::text),'')) AS fingerprint FROM public.${pg.escapeIdentifier(table)} t`,
      )
    ).rows[0];
    result[table] = r;
  }
  return result;
}
let restored;
try {
  // Freeze application writes during this drill; migrations and user data are never reset.
  const before = await snapshot(admin);
  docker([
    'compose',
    'exec',
    '-T',
    'postgres',
    'pg_dump',
    '-U',
    owner.username,
    '-d',
    'pact',
    '--format=custom',
    '--file=/tmp/pact-phase3.dump',
  ]);
  const container = docker(['compose', 'ps', '-q', 'postgres']);
  docker(['cp', container + ':/tmp/pact-phase3.dump', backup]);
  await admin.query(`CREATE DATABASE "${restoredName}"`);
  docker([
    'compose',
    'exec',
    '-T',
    'postgres',
    'pg_restore',
    '-U',
    owner.username,
    '--dbname=' + restoredName,
    '--exit-on-error',
    '/tmp/pact-phase3.dump',
  ]);
  const restoredURL = new URL(owner);
  restoredURL.pathname = '/' + restoredName;
  restored = new pg.Client({ connectionString: restoredURL.href });
  await restored.connect();
  const after = await snapshot(restored);
  const checks = Object.fromEntries(
    tables.map((table) => [
      table,
      {
        rows: before[table].count,
        restoredRows: after[table].count,
        exactMatch:
          before[table].count === after[table].count &&
          before[table].fingerprint === after[table].fingerprint,
      },
    ]),
  );
  const report = {
    kind: 'real-postgresql-pg_dump-pg_restore',
    restoredDatabase: restoredName,
    backupSha256: createHash('sha256').update(readFileSync(backup)).digest('hex'),
    checks,
    pass: Object.values(checks).every((c) => c.exactMatch),
  };
  writeFileSync(join(directory, 'recovery-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (!report.pass) process.exitCode = 1;
} finally {
  await restored?.end();
  await admin.end();
}
