// Public development tunnel target: ONLY the verified PayPal inbox is forwarded.
// No auth cookies, bearer tokens, private Pact reads, health details or arbitrary paths.
import { createServer } from 'node:http';
const allowedHeaders = [
  'paypal-transmission-id',
  'paypal-transmission-time',
  'paypal-transmission-sig',
  'paypal-cert-url',
  'paypal-auth-algo',
];
const server = createServer(async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/v1/webhooks/paypal') {
    response.writeHead(404).end();
    return;
  }
  if (!request.headers['content-type']?.startsWith('application/json')) {
    response.writeHead(415).end();
    return;
  }
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 256 * 1024) {
        response.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const headers = { 'content-type': 'application/json' };
    for (const key of allowedHeaders) {
      const value = request.headers[key];
      if (typeof value === 'string' && value.length <= 4096) headers[key] = value;
    }
    const result = await fetch('http://127.0.0.1:4000/v1/webhooks/paypal', {
      method: 'POST',
      headers,
      body: Buffer.concat(chunks),
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    response.writeHead(result.status, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
    // Deliberately expose no upstream response data except receipt status.
    response.end(JSON.stringify({ received: result.ok }));
  } catch {
    response.writeHead(503).end();
  }
});
server.headersTimeout = 10000;
server.requestTimeout = 35000;
server.maxConnections = 20;
server.listen(4001, '127.0.0.1', () =>
  console.log('PayPal-only relay listening on loopback port 4001.'),
);
