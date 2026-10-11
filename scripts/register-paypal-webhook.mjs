import { readFileSync, writeFileSync } from 'node:fs';
process.loadEnvFile('.env');
const tunnelLog = readFileSync('.tunnel-phase3-error.log', 'utf8');
const base = tunnelLog.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
if (!base) throw new Error('No actual connected Quick Tunnel URL was found.');
const url = base + '/v1/webhooks/paypal';
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
let webhook = (await list.json()).webhooks?.find((w) => w.url === url);
const events = [
  'CHECKOUT.ORDER.APPROVED',
  'PAYMENT.CAPTURE.COMPLETED',
  'PAYMENT.CAPTURE.REFUNDED',
  'PAYMENT.CAPTURE.DENIED',
];
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
const env = readFileSync('.env', 'utf8');
const next = /^PAYPAL_WEBHOOK_ID=/m.test(env)
  ? env.replace(/^PAYPAL_WEBHOOK_ID=.*$/gm, 'PAYPAL_WEBHOOK_ID=' + webhook.id)
  : env + '\nPAYPAL_WEBHOOK_ID=' + webhook.id + '\n';
writeFileSync('.env', next);
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
