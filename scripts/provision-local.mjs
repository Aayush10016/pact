import { existsSync } from 'node:fs';
import pg from 'pg';
if (existsSync('.env')) process.loadEnvFile('.env');
if (process.env.NODE_ENV === 'production')
  throw new Error('Provision deployment roles through your database administrator.');
const value = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!value) throw new Error('Migration database connection is required.');
const url = new URL(value);
if (
  !['localhost', '127.0.0.1', 'postgres'].includes(url.hostname) ||
  !['/pact', '/pact_phase2_tests'].includes(url.pathname)
)
  throw new Error(
    'Local provisioning only supports the explicitly named Pact development databases.',
  );
const password = process.env.APP_DATABASE_PASSWORD || 'pact_runtime_local_only';
const db = new pg.Client({ connectionString: value });
await db.connect();
try {
  const result = await db.query(
    "SELECT format('ALTER ROLE pact_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L',$1::text)",
    [password],
  );
  await db.query(result.rows[0].format);
  console.log('Local restricted runtime identity provisioned.');
} finally {
  await db.end();
}
