import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
if (existsSync('.env')) process.loadEnvFile('.env');
const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required.');
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('SELECT pg_advisory_lock(72541001)');
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const directory = fileURLToPath(new URL('../infrastructure/docker/migrations/', import.meta.url));
  for (const name of (await readdir(directory)).filter((n) => n.endsWith('.sql')).sort()) {
    const sql = await readFile(`${directory}/${name}`, 'utf8');
    const sha = createHash('sha256').update(sql).digest('hex');
    const previous = await client.query('SELECT sha256 FROM schema_migrations WHERE name=$1', [
      name,
    ]);
    if (previous.rowCount) {
      if (previous.rows[0].sha256 !== sha) throw new Error(`Applied migration changed: ${name}`);
      continue;
    }
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name,sha256) VALUES($1,$2)', [name, sha]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    console.log(`Applied ${name}`);
  }
} finally {
  await client.query('SELECT pg_advisory_unlock(72541001)');
  await client.end();
}
