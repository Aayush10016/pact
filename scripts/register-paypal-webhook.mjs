import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    'env-file': { type: 'string', default: '.env' },
    'replace-current': { type: 'boolean', default: false },
  },
});
const envFile = values['env-file'];
process.loadEnvFile(envFile);
const legacy = values.url ? null : readFileSync('.tunnel-phase3-error.log', 'utf8');
const candidate =
  values.url ||
  legacy.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0] + '/v1/webhooks/paypal';
const target = new URL(candidate);
if (
  target.protocol !== 'https:' ||
  target.username ||
  target.password ||
  target.search ||
  target.hash ||
  target.pathname !== '/v1/webhooks/paypal'
)
  throw new Error('An explicit HTTPS PayPal webhook URL is required.');
if (process.env.PAYPAL_BASE_URL !== 'https://api-m.sandbox.paypal.com')
  throw new Error('This tool only configures PayPal Sandbox.');
const base = target.origin;
const url = target.href;
const blocked = await fetch(base + '/v1/pacts', { signal: AbortSignal.timeout(15000) });
if (blocked.status !== 404) throw new Error('Relay exposed a private route; registration stopped.');
const reachable = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
  signal: AbortSignal.timeout(30000),
});
if (reachable.status !== 403)
  throw new Error('Unsigned webhook was not safely rejected; registration stopped.');
const api = 'https://api-m.sandbox.paypal.com';
if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET)
  throw new Error('Configure local PayPal Sandbox credentials.');
const tokenResponse = await fetch(api + '/v1/oauth2/token', {
  method: 'POST',
  headers: {
    Authorization:
      'Basic ' +
      Buffer.from(process.env.PAYPAL_CLIENT_ID + ':' + process.env.PAYPAL_CLIENT_SECRET).toString(
        'base64',
      ),
    'content-type': 'application/x-www-form-urlencoded',
  },
  body: 'grant_type=client_credentials',
  signal: AbortSignal.timeout(15000),
});
if (!tokenResponse.ok) throw new Error('Sandbox OAuth failed (HTTP ' + tokenResponse.status + ').');
const token = (await tokenResponse.json()).access_token;
if (typeof token !== 'string') throw new Error('Invalid Sandbox authorization response.');
const headers = { Authorization: 'Bearer ' + token, 'content-type': 'application/json' };
const list = await fetch(api + '/v1/notifications/webhooks', {
  headers,
  signal: AbortSignal.timeout(15000),
});
if (!list.ok) throw new Error('Webhook listing failed (HTTP ' + list.status + ').');
const webhooks = (await list.json()).webhooks || [];
let webhook = webhooks.find((w) => w.url === url);
const events = [
  'CHECKOUT.ORDER.APPROVED',
  'PAYMENT.CAPTURE.COMPLETED',
  'PAYMENT.CAPTURE.REFUNDED',
  'PAYMENT.CAPTURE.DENIED',
];
if (!webhook && values['replace-current']) {
  const current = webhooks.find((w) => w.id === process.env.PAYPAL_WEBHOOK_ID);
  if (current) {
    const patched = await fetch(api + '/v1/notifications/webhooks/' + current.id, {
      method: 'PATCH',
      headers,
      body: JSON.stringify([
        { op: 'replace', path: '/url', value: url },
        { op: 'replace', path: '/event_types', value: events.map((name) => ({ name })) },
      ]),
      signal: AbortSignal.timeout(20000),
    });
    if (!patched.ok) throw new Error('Sandbox webhook update failed.');
    const readback = await fetch(api + '/v1/notifications/webhooks/' + current.id, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!readback.ok) throw new Error('Updated webhook readback failed.');
    webhook = await readback.json();
  }
}
if (!webhook) {
  const created = await fetch(api + '/v1/notifications/webhooks', {
    method: 'POST',
    headers,
    body: JSON.stringify({ url, event_types: events.map((name) => ({ name })) }),
    signal: AbortSignal.timeout(20000),
  });
  if (!created.ok)
    throw new Error('Sandbox webhook registration failed (HTTP ' + created.status + ').');
  webhook = await created.json();
}
if (
  typeof webhook.id !== 'string' ||
  webhook.url !== url ||
  events.some((name) => !webhook.event_types?.some((e) => e.name === name))
)
  throw new Error('Registered webhook does not match required configuration.');
const env = readFileSync(envFile, 'utf8');
const next = /^PAYPAL_WEBHOOK_ID=/m.test(env)
  ? env.replace(/^PAYPAL_WEBHOOK_ID=.*$/gm, 'PAYPAL_WEBHOOK_ID=' + webhook.id)
  : env + '\nPAYPAL_WEBHOOK_ID=' + webhook.id + '\n';
writeFileSync(envFile, next);
console.log(
  JSON.stringify({
    sandboxOAuth: 'PASS',
    restrictedTunnel: 'PASS',
    unsignedWebhook: 'REJECTED',
    registration: 'PASS',
    webhookUrl: url,
    eventTypes: events,
    webhookId: 'stored only in ignored .env',
  }),
);
