import { afterEach, expect, it, vi } from 'vitest';
import { PayPalProvider, decimalAmount, minorAmount } from '../src/payments/paypal.provider';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
