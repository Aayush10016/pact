import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import pg from 'pg';
process.loadEnvFile('.env');
const report = JSON.parse(
  readFileSync(
    process.argv[2] ?? '.recovery-local/marketplace-before-migrations/recovery-report.json',
    'utf8',
  ),
);
const url = new URL(process.env.MIGRATION_DATABASE_URL);
if (
  !['localhost', '127.0.0.1'].includes(url.hostname) ||
  url.pathname !== '/pact' ||
  !/^pact_restore_\d+$/.test(report.restoredDatabase) ||
  report.pass !== true
)
  throw new Error('A verified local pre-migration restore is required.');
const restoredUrl = new URL(url);
restoredUrl.pathname = '/' + report.restoredDatabase;
const current = new pg.Client({ connectionString: url.href });
const original = new pg.Client({ connectionString: restoredUrl.href });
const changed = [];
let checked = 0;
try {
  await current.connect();
  await original.connect();
  for (const table of Object.keys(report.checks)) {
    if (table === 'schema_migrations') continue;
    const columns = (
      await original.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
        [table],
      )
    ).rows.map((r) => pg.escapeIdentifier(r.column_name));
    if (!columns.length) throw new Error('Original table missing.');
    const sql = `SELECT ${columns.join(',')} FROM public.${pg.escapeIdentifier(table)}`;
    const fingerprint = async (client) =>
      createHash('sha256')
        .update(
          (await client.query(sql)).rows
            .map((row) => JSON.stringify(row))
            .sort()
            .join('\n'),
        )
        .digest('hex');
    if ((await fingerprint(current)) !== (await fingerprint(original))) changed.push(table);
    checked++;
  }
  console.log(
    JSON.stringify({
      kind: 'existing-data-preserved-across-additive-migration',
      checkedTables: checked,
      changedTables: changed,
      pass: changed.length === 0,
    }),
  );
  if (changed.length) process.exitCode = 1;
} finally {
  await current.end();
  await original.end();
}
