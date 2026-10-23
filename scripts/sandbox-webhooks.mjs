import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  openSync,
  closeSync,
} from 'node:fs';
import { join } from 'node:path';
mkdirSync('.recovery-local', { recursive: true });
const lock = '.recovery-local/sandbox-webhooks.lock';
if (existsSync(lock)) {
  const prior = Number(readFileSync(lock, 'utf8'));
  let alive = false;
  try {
    if (Number.isInteger(prior) && prior > 0) {
      process.kill(prior, 0);
      alive = true;
    }
  } catch {
    /* A stale PID or temporary network failure is handled below. */
  }
  if (alive) throw new Error('The Sandbox webhook helper is already running.');
  unlinkSync(lock);
}
const descriptor = openSync(lock, 'wx');
writeFileSync(descriptor, String(process.pid));
closeSync(descriptor);
const children = [];
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
  if (existsSync(lock)) unlinkSync(lock);
}
process.on('exit', close);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    close();
    process.exit(0);
  });
function launch(command, args, name) {
  const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  child.on('error', () => {
    console.error(`${name} could not start.`);
    close();
    process.exitCode = 1;
  });
  child.on('exit', () => {
    if (!closing) {
      console.error(`${name} stopped; Sandbox callbacks are offline.`);
      close();
      process.exitCode = 1;
    }
  });
  return child;
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  const ready = await fetch('http://127.0.0.1:4000/ready', { signal: AbortSignal.timeout(5000) });
  if (!ready.ok) throw new Error('Start the Pact API before the webhook helper.');
  const relay = launch(process.execPath, ['scripts/webhook-relay.mjs'], 'Restricted relay');
  relay.stdout.resume();
  relay.stderr.resume();
  await delay(800);
  if (closing) throw new Error('Relay unavailable.');
  const binary =
    process.env.CLOUDFLARED_PATH ||
    (process.platform === 'win32'
      ? join(
          process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)',
          'cloudflared',
          'cloudflared.exe',
        )
      : 'cloudflared');
  const tunnel = launch(
    binary,
    ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:4001'],
    'Cloudflare tunnel',
  );
  let buffer = '';
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('The temporary tunnel did not become ready.')),
      60000,
    );
    const receive = (chunk) => {
      buffer = (buffer + chunk.toString()).slice(-16000);
      const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    };
    tunnel.stdout.on('data', receive);
    tunnel.stderr.on('data', receive);
    tunnel.once('error', () => {
      clearTimeout(timer);
      reject(new Error('Cloudflare tunnel unavailable.'));
    });
  });
  let configured = false;
  for (let attempt = 0; attempt < 10 && !closing; attempt++) {
    // Wait for tunnel/DNS before mutating the provider registration.
    try {
      const probe = await fetch(url + '/v1/webhooks/paypal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(10000),
      });
      if (probe.status === 403) {
        configured = true;
        break;
      }
    } catch {
      /* A stale PID or temporary network failure is handled below. */
    }
    await delay(3000);
  }
  if (!configured) throw new Error('Public relay could not be verified; registration unchanged.');
  const result = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        'scripts/register-paypal-webhook.mjs',
        '--url',
        url + '/v1/webhooks/paypal',
        '--replace-current',
      ],
      { windowsHide: true, stdio: 'inherit' },
    );
    child.on('error', () => resolve(1));
    child.on('exit', resolve);
  });
  if (result !== 0) throw new Error('Sandbox webhook registration failed.');
  writeFileSync(
    '.recovery-local/sandbox-webhooks.json',
    JSON.stringify({ url: url + '/v1/webhooks/paypal', pid: process.pid }),
  );
  console.log(
    'Sandbox webhook connected. Keep this helper running; a restart verifies and reconnects a new temporary URL.',
  );
} catch (error) {
  console.error(error.message);
  close();
  process.exitCode = 1;
}
