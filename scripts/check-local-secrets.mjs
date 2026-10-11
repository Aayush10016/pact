import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
const files = new Set([
  ...execFileSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8' })
    .trim()
    .split(/\r?\n/),
  ...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' })
    .trim()
    .split(/\r?\n/),
]);
const names = [
  'CLERK_SECRET_KEY',
  'NVIDIA_NIM_API_KEY',
  'PAYPAL_CLIENT_SECRET',
  'PAYPAL_CLIENT_ID',
  'PAYPAL_WEBHOOK_ID',
  'POSTGRES_PASSWORD',
  'APP_DATABASE_PASSWORD',
  'MINIO_SECRET_ACCESS_KEY',
  'DATABASE_URL',
  'MIGRATION_DATABASE_URL',
  'S3_SECRET_ACCESS_KEY',
  'MINIO_ROOT_PASSWORD',
  'AI_SERVICE_KEY',
];
const matches = [];
for (const file of files) {
  if (!file || !existsSync(file) || !statSync(file).isFile()) continue;
  const content = readFileSync(file, 'utf8');
  for (const name of names) {
    const value = process.env[name];
    if (value && value.length > 12 && content.includes(value))
      matches.push({ file, variable: name });
  }
}
console.log(JSON.stringify({ checkedFiles: files.size, configuredSecretMatches: matches }));
if (matches.length) process.exitCode = 1;
