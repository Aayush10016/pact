import { afterEach, expect, it, vi } from 'vitest';
import {
  PayPalProvider,
  ProviderError,
  validateCaptureOrder,
  decimalAmount,
  minorAmount,
} from '../src/payments/paypal.provider';
it('rejects wrong currency, amount, ownership, intent, and extra units before capture', () => {
  const tx = { id: 'tx', order_id: 'ORDER1', amount_minor: '500000', currency: 'USD' };
  const unit = { custom_id: 'tx', amount: { currency_code: 'USD', value: '5000.00' } };
  const order = { id: 'ORDER1', status: 'APPROVED', intent: 'CAPTURE', purchase_units: [unit] };
  expect(() => validateCaptureOrder(order, tx)).not.toThrow();
  for (const invalid of [
    { ...order, id: 'OTHER' },
    { ...order, intent: 'AUTHORIZE' },
    { ...order, purchase_units: [unit, unit] },
    { ...order, purchase_units: [{ ...unit, custom_id: 'other' }] },
    { ...order, purchase_units: [{ ...unit, amount: { ...unit.amount, currency_code: 'EUR' } }] },
    { ...order, purchase_units: [{ ...unit, amount: { ...unit.amount, value: '5000.01' } }] },
  ])
    expect(() => validateCaptureOrder(invalid, tx)).toThrow();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it.each([401, 403, 404, 422, 500])(
  'retains safe diagnostics for HTTP %s without provider text or secrets',
  async (status) => {
    setup();
    vi.stubGlobal('fetch', async (url: string) =>
      Response.json(
        url.endsWith('/token')
          ? { access_token: 'test-token', expires_in: 3600 }
          : {
              name: 'RESOURCE_NOT_FOUND',
              debug_id: 'abc123def4567',
              details: [{ issue: 'INVALID_RESOURCE_ID', description: 'test-secret' }],
              message: 'test-secret',
            },
        { status: url.endsWith('/token') ? 200 : status },
      ),
    );
    const error = await new PayPalProvider().getOrder('OLDORDER').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(JSON.stringify(error)).not.toContain('test-secret');
    expect((error as ProviderError).diagnostic.http).toBe(status);
    expect((error as ProviderError).userMessage).not.toContain('test-secret');
  },
);
it('requests a full capture representation once with the durable request ID', async () => {
  setup();
  const calls: RequestInit[] = [];
  vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
    calls.push(options);
    return Response.json(
      url.endsWith('/token')
        ? { access_token: 'test-token', expires_in: 3600 }
        : {
            id: 'ORDER1',
            status: 'COMPLETED',
            purchase_units: [
              {
                custom_id: 'tx',
                amount: { currency_code: 'USD', value: '5000.00' },
                payments: {
                  captures: [
                    {
                      id: 'CAP1',
                      status: 'COMPLETED',
                      amount: { currency_code: 'USD', value: '5000.00' },
                    },
                  ],
                },
              },
            ],
          },
    );
  });
  expect((await new PayPalProvider().capture('ORDER1', 'durable-id')).status).toBe('COMPLETED');
  expect(calls).toHaveLength(2);
  expect(calls[1]?.headers).toMatchObject({
    'PayPal-Request-Id': 'durable-id',
    Prefer: 'return=representation',
  });
});
it('fails safely on rejected or malformed OAuth and ambiguous capture responses', async () => {
  setup();
  vi.stubGlobal('fetch', async () =>
    Response.json({ error: 'invalid_client', message: 'test-secret' }, { status: 401 }),
  );
  await expect(new PayPalProvider().accessToken()).rejects.toMatchObject({
    uncertain: false,
    diagnostic: { http: 401 },
  });
  vi.stubGlobal('fetch', async () => Response.json({ access_token: 123 }));
  await expect(new PayPalProvider().accessToken()).rejects.toBeInstanceOf(ProviderError);
  vi.stubGlobal('fetch', async (url: string) =>
    url.endsWith('/token')
      ? Response.json({ access_token: 'test-token', expires_in: 3600 })
      : new Response('not JSON', { status: 200 }),
  );
  await expect(new PayPalProvider().capture('ORDER1', 'durable-id')).rejects.toMatchObject({
    uncertain: true,
  });
});
function setup() {
  vi.stubEnv('PAYPAL_CLIENT_ID', 'test-only');
  vi.stubEnv('PAYPAL_CLIENT_SECRET', 'test-only');
  vi.stubEnv('PAYPAL_WEBHOOK_ID', 'test-only');
  vi.stubEnv('PAYPAL_BASE_URL', 'https://api-m.sandbox.paypal.com');
  vi.stubEnv('WEB_ORIGIN', 'https://pact.example');
}
it('formats financial amounts with integer arithmetic', () => {
  expect(decimalAmount('2550')).toBe('25.50');
  expect(decimalAmount('9007199254740991')).toBe('90071992547409.91');
  expect(minorAmount('25.50')).toBe('2550');
  expect(() => minorAmount('25.501')).toThrow();
});
it('uses OAuth, official sandbox APIs, and a stable request ID', async () => {
  setup();
  const calls: Array<{ url: string; options: RequestInit }> = [];
  vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
    calls.push({ url, options });
    return Response.json(
      url.endsWith('/token')
        ? { access_token: 'test-token', expires_in: 3600 }
        : {
            id: 'ORDER1',
            status: 'CREATED',
            links: [
              {
                rel: 'payer-action',
                href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER1',
              },
            ],
          },
    );
  });
  const provider = new PayPalProvider();
  await provider.createOrder('transaction-one', '2550', 'USD', 'request-one', 'pact-one');
  expect(calls[1]!.url).toBe('https://api-m.sandbox.paypal.com/v2/checkout/orders');
  expect((calls[1]!.options.headers as Record<string, string>)['PayPal-Request-Id']).toBe(
    'request-one',
  );
  const body = JSON.parse(String(calls[1]!.options.body));
  expect(body.purchase_units[0].amount.value).toBe('25.50');
  expect(body.purchase_units[0].custom_id).toBe('transaction-one');
});
it('fails closed for production endpoints and fake webhook signatures', async () => {
  setup();
  vi.stubEnv('PAYPAL_BASE_URL', 'https://api-m.paypal.com');
  await expect(new PayPalProvider().accessToken()).rejects.toThrow('Production endpoints');
  setup();
  const provider = new PayPalProvider();
  expect(await provider.verify({ 'paypal-cert-url': 'http://169.254.169.254/' }, {})).toBe(false);
  vi.stubGlobal('fetch', async (url: string) =>
    Response.json(
      url.endsWith('/token')
        ? { access_token: 'test-token', expires_in: 3600 }
        : { verification_status: 'FAILURE' },
    ),
  );
  expect(
    await provider.verify(
      {
        'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/test-cert',
        'paypal-auth-algo': 'SHA256withRSA',
      },
      {},
    ),
  ).toBe(false);
});
