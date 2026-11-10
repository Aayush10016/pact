import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
if (existsSync('.env')) process.loadEnvFile('.env');
const mode = process.argv[2] ?? 'dev';
if (!['dev', 'start'].includes(mode)) throw new Error('Expected dev or start');
process.env.NODE_ENV = mode === 'start' ? 'production' : 'development';
const port = process.env.PACT_WEB_PORT ?? '3000';
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
  throw new Error('Invalid web port');
// Loading the file here avoids Next.js copying --env-file into unsupported NODE_OPTIONS.
const child = spawn(
  process.execPath,
  [
    'apps/web/node_modules/next/dist/bin/next',
    mode,
    'apps/web',
    '--hostname',
    'localhost',
    '--port',
    port,
  ],
  { env: process.env, stdio: 'inherit' },
);
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
