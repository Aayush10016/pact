import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
// Fills only missing values. Existing installations must rotate database roles separately.
let text = readFileSync(existsSync('.env') ? '.env' : '.env.example', 'utf8');
const values = {};
for (const line of text.split(/\r?\n/)) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line);
  if (match) values[match[1]] = match[2];
}
function setMissing(key, value) {
  if (values[key]) return;
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  text = pattern.test(text) ? text.replace(pattern, () => line) : `${text}\n${line}\n`;
  values[key] = value;
}
for (const key of ['POSTGRES_PASSWORD', 'APP_DATABASE_PASSWORD', 'MINIO_SECRET_ACCESS_KEY'])
  setMissing(key, randomBytes(32).toString('hex'));
setMissing('MINIO_ACCESS_KEY_ID', randomBytes(16).toString('hex'));
setMissing(
  'MIGRATION_DATABASE_URL',
  `postgresql://${values.POSTGRES_USER || 'pact'}:${values.POSTGRES_PASSWORD}@localhost:${values.POSTGRES_PORT || '55432'}/${values.POSTGRES_DB || 'pact'}`,
);
setMissing(
  'DATABASE_URL',
  `postgresql://pact_runtime:${values.APP_DATABASE_PASSWORD}@localhost:${values.POSTGRES_PORT || '55432'}/${values.POSTGRES_DB || 'pact'}`,
);
writeFileSync('.env', text, { mode: 0o600 });
console.log('Private local environment ready. Existing configured values were preserved.');
