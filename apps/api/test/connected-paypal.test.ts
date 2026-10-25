import { afterEach, expect, it, vi } from 'vitest';
import {
  PayPalAccountsService,
  referralIdFromSelf,
  verifiedMerchant,
} from '../src/accounts/paypal-accounts.module';
import type { Database } from '../src/database/database.module';
import {
  paymentProvider,
  paypalAuthAssertion,
  PayPalProvider,
  ProviderError,
  validateCaptureOrder,
} from '../src/payments/paypal.provider';
function configureSeparateApps() {
  vi.stubEnv('PAYPAL_BASE_URL', 'https://api-m.sandbox.paypal.com');
  vi.stubEnv('PAYPAL_CLIENT_ID', 'legacy');
  vi.stubEnv('PAYPAL_CLIENT_SECRET', 'legacy-secret-test');
  vi.stubEnv('PAYPAL_WEBHOOK_ID', 'legacy-webhook');
  vi.stubEnv('PAYPAL_PLATFORM_CLIENT_ID', 'platform');
  vi.stubEnv('PAYPAL_PLATFORM_CLIENT_SECRET', 'platform-secret-test');
  vi.stubEnv('PAYPAL_PLATFORM_WEBHOOK_ID', 'platform-webhook');
  vi.stubEnv('PAYPAL_PLATFORM_MERCHANT_ID', 'PARTNER12345');
  vi.stubEnv('PAYPAL_PLATFORM_ATTRIBUTION_ID', 'Pact_Test');
}
it('keeps legacy and Platform OAuth tokens, assertions and attribution separate', async () => {
  configureSeparateApps();
  const seen: { path: string; headers: Headers }[] = [];
  vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
    const headers = new Headers(options.headers);
    seen.push({ path: url, headers });
    if (url.endsWith('/token')) {
      const identity = Buffer.from(headers.get('authorization')!.slice(6), 'base64')
        .toString()
        .split(':')[0];
      return Response.json({ access_token: `${identity}-token`, expires_in: 3600 });
    }
    return Response.json({ id: 'ORDER1', status: 'CREATED' });
  });
  const provider = new PayPalProvider();
  await provider.getOrder('LEGACY1');
  await provider.platform().request('/v2/customer/partner-referrals/REFERRAL1', 'GET');
  await provider.forMerchant('SELLER12345').getOrder('CONNECTED1');
  await provider.getOrder('LEGACY2');
  const requests = seen.filter((c) => !c.path.endsWith('/token'));
  expect(requests.map((c) => c.headers.get('authorization'))).toEqual([
    'Bearer legacy-token',
    'Bearer platform-token',
    'Bearer platform-token',
    'Bearer legacy-token',
  ]);
  for (const request of [requests[0]!, requests[3]!]) {
    expect(request.headers.has('PayPal-Partner-Attribution-Id')).toBe(false);
    expect(request.headers.has('PayPal-Auth-Assertion')).toBe(false);
  }
  expect(requests[2]!.headers.get('PayPal-Auth-Assertion')).toBe(
    paypalAuthAssertion('platform', 'SELLER12345'),
  );
  expect(seen.filter((c) => c.path.endsWith('/token'))).toHaveLength(2);
});
it('does not use working legacy credentials when Platform credentials are missing', () => {
  configureSeparateApps();
  vi.stubEnv('PAYPAL_PLATFORM_CLIENT_SECRET', '');
  const provider = new PayPalProvider();
  expect(provider.enabled()).toBe(true);
  expect(provider.partnerConfigured()).toBe(false);
  expect(() => provider.forMerchant('SELLER12345')).toThrow('not configured');
});
it('verifies both app webhooks independently and rejects a legacy signature for onboarding', async () => {
  configureSeparateApps();
  const verification: { authorization: string | null; webhook: string }[] = [];
  vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
    const headers = new Headers(options.headers);
    if (url.endsWith('/token')) {
      const identity = Buffer.from(headers.get('authorization')!.slice(6), 'base64')
        .toString()
        .split(':')[0];
      return Response.json({ access_token: `${identity}-token`, expires_in: 3600 });
    }
    const body = JSON.parse(String(options.body));
    verification.push({ authorization: headers.get('authorization'), webhook: body.webhook_id });
    return Response.json({
      verification_status: body.webhook_id === 'legacy-webhook' ? 'SUCCESS' : 'FAILURE',
    });
  });
  const headers = {
    'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT1',
    'paypal-auth-algo': 'SHA256withRSA',
  };
  const provider = new PayPalProvider();
  expect(await provider.verify(headers, {})).toBe(true);
  expect(await provider.verifyPlatform(headers, {})).toBe(false);
  expect(verification).toContainEqual({
    authorization: 'Bearer legacy-token',
    webhook: 'legacy-webhook',
  });
  expect(verification).toContainEqual({
    authorization: 'Bearer platform-token',
    webhook: 'platform-webhook',
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const merchant = 'MERCHANT12345';
const scopes = [
  'https://uri.paypal.com/services/payments/refund',
  'https://uri.paypal.com/services/payments/payment/authcapture',
];
it('refreshes an existing referral through the Platform app without creating another referral', async () => {
  const opaqueId = 'A'.repeat(110) + '==';
  const row = { status: 'PENDING', tracking_id: 'tracking', referral_id: opaqueId };
  const query = vi.fn(async () => ({ rows: [row] }));
  const request = vi.fn(async () => ({
    links: [
      {
        rel: 'action_url',
        href: 'https://www.sandbox.paypal.com/bizsignup/partner/entry?token=new',
      },
      {
        rel: 'self',
        href:
          'https://api-m.sandbox.paypal.com/v2/customer/partner-referrals/' +
          encodeURIComponent(opaqueId),
      },
    ],
  }));
  const service = new PayPalAccountsService(
    { query } as unknown as Database,
    { partnerConfigured: () => true, platform: () => ({ request }) } as unknown as PayPalProvider,
  );
  await service.connect('user', { consent: true });
  expect(request).toHaveBeenCalledExactlyOnceWith(
    '/v2/customer/partner-referrals/' + encodeURIComponent(opaqueId),
    'GET',
    undefined,
    'tracking',
  );
  expect(query.mock.calls).toHaveLength(3);
});
it('preserves opaque referral IDs and refuses untrusted self links', () => {
  const id = 'A'.repeat(110) + '/+==';
  expect(
    referralIdFromSelf(
      'https://api-m.sandbox.paypal.com/v2/customer/partner-referrals/' + encodeURIComponent(id),
    ),
  ).toBe(id);
  expect(
    referralIdFromSelf(
      'https://api.sandbox.paypal.com/v2/customer/partner-referrals/' + encodeURIComponent(id),
    ),
  ).toBe(id);
  for (const url of [
    'https://example.test/v2/customer/partner-referrals/ID',
    'https://api-m.paypal.com/v2/customer/partner-referrals/ID',
    'https://user@api-m.sandbox.paypal.com/v2/customer/partner-referrals/ID',
    'https://api-m.sandbox.paypal.com/v2/customer/partner-referrals/%2E%2E%2Fbad',
  ])
    expect(() => referralIdFromSelf(url)).toThrow();
});
it('explains an unconfirmed connection without reporting a payment failure or marking it verified', async () => {
  const query = vi.fn(async () => ({ rows: [{ status: 'PENDING', tracking_id: 'tracking' }] }));
  const request = vi.fn(async () => {
    throw new ProviderError(false, { http: 404 });
  });
  const service = new PayPalAccountsService(
    { query } as unknown as Database,
    { partnerConfigured: () => true, platform: () => ({ request }) } as unknown as PayPalProvider,
  );
  await expect(service.refresh('user')).rejects.toMatchObject({
    status: 409,
    message: expect.stringContaining('has not confirmed an account connection'),
  });
  expect(query).toHaveBeenCalledTimes(1);
});
const fact = {
  merchant_id: merchant,
  tracking_id: 'tracking',
  payments_receivable: true,
  primary_email_confirmed: true,
  oauth_integrations: [{ oauth_third_party: [{ partner_client_id: 'platform', scopes }] }],
};
it('requires exact tracking identity, platform grant, confirmed email and receiving eligibility', () => {
  expect(verifiedMerchant(fact, 'tracking', 'platform')).toEqual({
    merchantId: merchant,
    ready: true,
  });
  expect(verifiedMerchant(fact, 'other', 'platform')).toBeNull();
  for (const invalid of [
    { ...fact, payments_receivable: false },
    { ...fact, primary_email_confirmed: false },
    { ...fact, oauth_integrations: [] },
    {
      ...fact,
      oauth_integrations: [{ oauth_third_party: [{ partner_client_id: 'different', scopes }] }],
    },
    {
      ...fact,
      oauth_integrations: [
        { oauth_third_party: [{ partner_client_id: 'platform', scopes: scopes.slice(0, 1) }] },
      ],
    },
  ])
    expect(verifiedMerchant(invalid, 'tracking', 'platform')?.ready).toBe(false);
  expect(
    verifiedMerchant(
      { permissionsGranted: true, merchantIdInPayPal: merchant },
      'tracking',
      'platform',
    ),
  ).toBeNull();
});
it('rejects developer-merchant fallback and wrong order payee for connected transactions', () => {
  const provider = new PayPalProvider();
  expect(paymentProvider(provider, { payment_route: 'LEGACY' })).toBe(provider);
  expect(() => paymentProvider(provider, { payment_route: 'CONNECTED' })).toThrow('must connect');
  const tx = {
    id: 'tx',
    order_id: 'ORDER1',
    amount_minor: '2500',
    currency: 'USD',
    payment_route: 'CONNECTED',
    payee_merchant_id: merchant,
  };
  const unit = {
    custom_id: 'tx',
    payee: { merchant_id: merchant },
    amount: { currency_code: 'USD', value: '25.00' },
  };
  const order = { id: 'ORDER1', status: 'APPROVED', intent: 'CAPTURE', purchase_units: [unit] };
  expect(() => validateCaptureOrder(order, tx)).not.toThrow();
  expect(() =>
    validateCaptureOrder(
      { ...order, purchase_units: [{ ...unit, payee: { merchant_id: 'OTHER12345' } }] },
      tx,
    ),
  ).toThrow();
  expect(() =>
    validateCaptureOrder(
      { ...order, purchase_units: [{ custom_id: 'tx', amount: unit.amount }] },
      tx,
    ),
  ).toThrow();
});
it('uses the recipient assertion and purchase-unit merchant across payment and refund requests', async () => {
  vi.stubEnv('PAYPAL_BASE_URL', 'https://api-m.sandbox.paypal.com');
  vi.stubEnv('PAYPAL_PLATFORM_CLIENT_ID', 'platform');
  vi.stubEnv('PAYPAL_PLATFORM_CLIENT_SECRET', 'private-test-value');
  vi.stubEnv('PAYPAL_PLATFORM_WEBHOOK_ID', 'webhook');
  vi.stubEnv('PAYPAL_PLATFORM_MERCHANT_ID', 'PARTNER12345');
  vi.stubEnv('PAYPAL_PLATFORM_ATTRIBUTION_ID', 'Pact_Test');
  vi.stubEnv('WEB_ORIGIN', 'https://pact.example');
  const calls: { url: string; options: RequestInit }[] = [];
  vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
    calls.push({ url, options });
    return Response.json(
      url.endsWith('/token')
        ? { access_token: 'test', expires_in: 3600 }
        : url.endsWith('/refund')
          ? { id: 'REFUND1', status: 'COMPLETED' }
          : { id: 'ORDER1', status: 'CREATED' },
    );
  });
  const scoped = paymentProvider(new PayPalProvider(), {
    payment_route: 'CONNECTED',
    payee_merchant_id: merchant,
  });
  await scoped.createOrder('tx', '2500', 'USD', 'stable-request', 'pact');
  await scoped.getOrder('ORDER1');
  await scoped.capture('ORDER1', 'stable-capture');
  await scoped.getCapture('CAPTURE1');
  await scoped.refund('CAPTURE1', '2500', 'USD', 'stable-refund');
  await scoped.getRefund('REFUND1');
  for (const call of calls.filter((c) => !c.url.endsWith('/token'))) {
    const headers = new Headers(call.options.headers);
    expect(headers.get('PayPal-Auth-Assertion')).toBe(paypalAuthAssertion('platform', merchant));
    expect(headers.get('PayPal-Partner-Attribution-Id')).toBe('Pact_Test');
  }
  const create = calls.find((c) => c.url.endsWith('/orders'))!;
  expect(JSON.parse(String(create.options.body)).purchase_units[0].payee).toEqual({
    merchant_id: merchant,
  });
});
