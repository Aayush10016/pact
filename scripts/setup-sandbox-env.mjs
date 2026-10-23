import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env.sandbox')) {
  console.log('Existing .env.sandbox preserved; no settings changed.');
} else {
  let text = readFileSync('infrastructure/sandbox/sandbox.env.example', 'utf8');
  const source = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
  const copy = [
    'CLERK_SECRET_KEY',
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    'CLERK_ISSUER',
    'NVIDIA_NIM_API_KEY',
    'NVIDIA_NIM_MODEL',
    'PAYPAL_CLIENT_ID',
    'PAYPAL_CLIENT_SECRET',
    'PAYPAL_WEBHOOK_ID',
    'PACT_REVIEWER_SUBJECTS',
    'PACT_OPERATOR_SUBJECTS',
  ];
  for (const key of copy) {
    // Preserve the existing dotenv quoting; never print or pass secrets on a command line.
    const line = source.match(new RegExp(`^${key}=.*$`, 'm'))?.[0];
    if (line) text = text.replace(new RegExp(`^${key}=.*$`, 'm'), () => line);
  }
  for (const key of [
    'POSTGRES_PASSWORD',
    'APP_DATABASE_PASSWORD',
    'MINIO_SECRET_ACCESS_KEY',
    'AI_SERVICE_KEY',
    'MINIO_ACCESS_KEY_ID',
  ])
    text = text.replace(
      new RegExp(`^${key}=.*$`, 'm'),
      () => `${key}=${randomBytes(32).toString('hex')}`,
    );
  writeFileSync('.env.sandbox', text, { mode: 0o600, flag: 'wx' });
  console.log(
    'Private .env.sandbox created with isolated random infrastructure credentials. Existing integration settings copied locally. Set the two hostnames when hosting is chosen.',
  );
}
