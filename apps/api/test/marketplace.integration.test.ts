import 'reflect-metadata';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { Database } from '../src/database/database.module';
import { IdentityVerifier } from '../src/auth/auth.module';
import { PayPalProvider } from '../src/payments/paypal.provider';
import { JobRuntime } from '../src/jobs/jobs.module';
import { LifecycleJobs } from '../src/jobs/lifecycle-jobs';
import { HttpErrorFilter } from '../src/common/http-error.filter';
const group = crypto.randomUUID();
const oldClient = process.env.PAYPAL_PLATFORM_CLIENT_ID;
const oldReviewers = process.env.PACT_REVIEWER_SUBJECTS;
let refunds = 0;
const refundId = 'TESTREFUND' + group.replaceAll('-', '');
let app: INestApplication,
  db: Database,
  jobs: LifecycleJobs,
  origin: string,
  listingId: string,
  pactId: string,
  sellerId: string,
  buyerId: string,
  txid: string;
let orderId = '',
  captureId = '',
  orderStatus = 'CREATED',
  createdOrders = 0,
  captured = 0,
  revoked = false,
  wrongMerchant = false;
const merchant = ('S' + group.replaceAll('-', '').slice(0, 12)).toUpperCase();
const amount = { currency_code: 'USD', value: '25.00' };
const order = () => ({
  id: orderId,
  status: orderStatus,
  intent: 'CAPTURE',
  purchase_units: [
    {
      custom_id: txid,
      amount,
      payee: { merchant_id: wrongMerchant ? 'OTHER1234567' : merchant },
      payments: { captures: captured ? [{ id: captureId, status: 'COMPLETED', amount }] : [] },
    },
  ],
});
// These doubles replace identity and PayPal only. PostgreSQL, runtime privileges, authorization, idempotency, outbox, receipts and worker logic are real.
const scoped = {
  createOrder: async (id: string) => {
    createdOrders++;
    txid = id;
    orderId = 'TESTORDER' + group.replaceAll('-', '');
    return {
      ...order(),
      links: [
        { rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=' + orderId },
      ],
    };
  },
  getOrder: async () => order(),
  capture: async () => {
    captured++;
    captureId = 'TESTCAPTURE' + group.replaceAll('-', '');
    orderStatus = 'COMPLETED';
    return order();
  },
  getCapture: async () => ({
    id: captureId,
    status: refunds ? 'REFUNDED' : 'COMPLETED',
    amount,
    supplementary_data: { related_ids: { order_id: orderId } },
  }),
  refund: async () => {
    refunds++;
    return { id: refundId, status: 'COMPLETED', amount };
  },
  getRefund: async () => ({
    id: refundId,
    status: 'COMPLETED',
    amount,
    links: [
      { rel: 'up', href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${captureId}` },
    ],
  }),
};
const paypal = {
  platform: () => paypal,
  enabled: () => true,
  partnerConfigured: () => true,
  forMerchant: (id: string) => {
    expect(id).toBe(merchant);
    return scoped;
  },
  request: async (path: string, method: string, body?: unknown) => {
    if (method === 'POST') {
      expect(path).toBe('/v2/customer/partner-referrals');
      expect(body).toMatchObject({ products: ['EXPRESS_CHECKOUT'] });
      return {
        links: [
          { rel: 'action_url', href: 'https://www.sandbox.paypal.com/bizsignup/partner/entry' },
          {
            rel: 'self',
            href: 'https://api-m.sandbox.paypal.com/v2/customer/partner-referrals/TESTREFERRAL',
          },
        ],
      };
    }
    const account = (
      await db.query('SELECT tracking_id FROM paypal_accounts WHERE user_id=$1', [sellerId])
    ).rows[0];
    if (path.includes('?tracking_id=')) {
      expect(path.endsWith(account.tracking_id)).toBe(true);
      return { merchant_id: merchant };
    }
    return {
      merchant_id: merchant,
      tracking_id: account.tracking_id,
      payments_receivable: !revoked,
      primary_email_confirmed: true,
      oauth_integrations: [
        {
          oauth_third_party: [
            {
              partner_client_id: 'marketplace-test-platform',
              scopes: [
                'https://uri.paypal.com/services/payments/refund',
                'https://uri.paypal.com/services/payments/payment/authcapture',
              ],
            },
          ],
        },
      ],
    };
  },
};
async function request(who: string | null, path: string, body?: unknown, key?: string) {
  return fetch(`${origin}/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(who ? { authorization: `Bearer ${who}.test.signature` } : {}),
      'content-type': 'application/json',
      ...(key ? { 'idempotency-key': key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function data(who: string | null, path: string) {
  const res = await request(who, path);
  expect(res.status).toBe(200);
  return (await res.json()).data;
}
const service = {
  title: 'Backend developer resume',
  description: 'Write a focused backend engineering resume using the candidate profile.',
  category: 'Writing',
  acceptanceCriteria:
    'A readable resume with backend skills, experience, projects and contact information.',
  expectedEvidence: 'A complete resume PDF.',
  amountMinor: '2500',
  currency: 'USD',
  deliveryDays: 7,
  published: true,
  expectedVersion: 0,
  requestId: crypto.randomUUID(),
};
beforeAll(async () => {
  process.env.PAYPAL_PLATFORM_CLIENT_ID = 'marketplace-test-platform';
  process.env.PACT_REVIEWER_SUBJECTS = `market-${group}-staff`;
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(IdentityVerifier)
    .useValue({
      verify: async (token: string) => {
        const who = token.split('.')[0];
        return {
          subject: `market-${group}-${who}`,
          email: `${who}-${group}@example.test`,
          name: `Market ${who}`,
        };
      },
    })
    .overrideProvider(PayPalProvider)
    .useValue(paypal)
    .overrideProvider(JobRuntime)
    .useValue({ onModuleInit: async () => {}, onModuleDestroy: async () => {} })
    .compile();
  app = mod.createNestApplication();
  app.useGlobalFilters(new HttpErrorFilter());
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
  db = mod.get(Database);
  jobs = mod.get(LifecycleJobs);
  sellerId = (await data('seller', 'me')).id;
  buyerId = (await data('buyer', 'me')).id;
}, 60000);
afterAll(async () => {
  if (oldReviewers === undefined) delete process.env.PACT_REVIEWER_SUBJECTS;
  else process.env.PACT_REVIEWER_SUBJECTS = oldReviewers;
  if (oldClient === undefined) delete process.env.PAYPAL_PLATFORM_CLIENT_ID;
  else process.env.PAYPAL_PLATFORM_CLIENT_ID = oldClient;
  await app?.close();
});
it('allows public discovery but protects listing drafts, edits and account data', async () => {
  expect((await request(null, 'services')).status).toBe(403);
  const created = await request('seller', 'services', service);
  expect(created.status).toBe(201);
  listingId = (await created.json()).data.id;
  expect((await (await request('seller', 'services', service)).json()).data.id).toBe(listingId);
  expect(
    (await request('seller', 'services', { ...service, title: 'Changed duplicate' })).status,
  ).toBe(409);
  expect(
    (await request('outsider', `services/${listingId}`, { ...service, expectedVersion: 1 })).status,
  ).toBe(409);
  const listing = await data(null, `marketplace/${listingId}`);
  expect(listing.title).toBe(service.title);
  expect(listing.paypal_ready).toBe(false);
  expect(listing).not.toHaveProperty('email');
  expect(listing).not.toHaveProperty('request_id');
  expect(listing).not.toHaveProperty('merchant_id');
  const results = await data(null, 'marketplace?q=backend&category=Writing');
  expect(results.some((s: { id: string }) => s.id === listingId)).toBe(true);
  const draft = await request('seller', 'services', {
    ...service,
    title: 'Private draft service',
    published: false,
    requestId: crypto.randomUUID(),
  });
  const draftId = (await draft.json()).data.id;
  expect((await request(null, `marketplace/${draftId}`)).status).toBe(404);
});
it('creates a consent-based Pact with immutable service terms, correct work owner and retry identity', async () => {
  const input = {
    requestId: crypto.randomUUID(),
    expectedVersion: 1,
    paymentCondition: 'Only after we accept the agreed terms.',
    acceptedTerms: true,
  };
  expect((await request('seller', `services/${listingId}/request`, input)).status).toBe(409);
  expect(
    (await request('buyer', `services/${listingId}/request`, { ...input, acceptedTerms: false }))
      .status,
  ).toBe(400);
  const made = await request('buyer', `services/${listingId}/request`, input);
  expect(made.status).toBe(201);
  pactId = (await made.json()).data.id;
  expect(
    (await (await request('buyer', `services/${listingId}/request`, input)).json()).data.id,
  ).toBe(pactId);
  expect(
    (
      await request('buyer', `services/${listingId}/request`, {
        ...input,
        paymentCondition: 'Different payment terms here.',
      })
    ).status,
  ).toBe(409);
  expect((await request('buyer', `pacts/${pactId}/payment/order`, {})).status).toBe(409);
  const detail = await data('buyer', `pacts/${pactId}`);
  expect(detail.status).toBe('CREATED');
  expect(detail.commitments[0].promised_by).toBe(sellerId);
  expect(detail.transaction.payment_route).toBe('CONNECTED');
  expect(detail.transaction.amount_minor).toBe('2500');
  expect((await request('outsider', `pacts/${pactId}`)).status).toBe(404);
  const saved = await request('seller', `services/${listingId}`, {
    ...service,
    expectedVersion: 1,
    amountMinor: '9900',
  });
  expect(saved.status).toBe(201);
  expect((await data('buyer', `pacts/${pactId}`)).transaction.amount_minor).toBe('2500');
  const invitations = await data('seller', 'me/invitations');
  const invite = invitations.find((i: { pact_id: string }) => i.pact_id === pactId);
  expect((await request('outsider', `invitations/${invite.id}/accept`, {})).status).toBe(403);
  expect((await request('seller', `invitations/${invite.id}/accept`, {})).status).toBe(201);
  expect((await data('seller', `pacts/${pactId}`)).deadline).toBeTruthy();
});
it('verifies the PayPal association before binding a recipient and never falls back to the platform merchant', async () => {
  expect((await request('buyer', `pacts/${pactId}/payment/order`, {})).status).toBe(409);
  expect(createdOrders).toBe(0);
  expect((await request('seller', 'me/paypal/connect', { consent: false })).status).toBe(400);
  expect((await request('seller', 'me/paypal/connect', { consent: true })).status).toBe(201);
  const verified = await request('seller', 'me/paypal/refresh', {});
  expect(verified.status).toBe(201);
  expect((await verified.json()).data.status).toBe('READY');
  expect((await request('seller', `pacts/${pactId}/payment/order`, {})).status).toBe(403);
  const queued = await request('buyer', `pacts/${pactId}/payment/order`, {});
  expect(queued.status).toBe(201);
  const op = (await queued.json()).data;
  const tx = (await db.query('SELECT * FROM transactions WHERE pact_id=$1', [pactId])).rows[0];
  expect(tx.payee_merchant_id).toBe(merchant);
  expect(tx.payee_user_id).toBe(sellerId);
  await jobs.payment(op.id);
  await jobs.payment(op.id);
  expect(createdOrders).toBe(1);
  await expect(
    db.query('UPDATE transactions SET payee_merchant_id=$2 WHERE id=$1', [tx.id, 'OTHER1234567']),
  ).rejects.toThrow(/permission denied|immutable/);
  await expect(
    db.query('SELECT bind_connected_payee($1,$2,$3)', [tx.id, sellerId, merchant]),
  ).rejects.toThrow('authorization invalid');
  await expect(
    db.query('SELECT bind_connected_payee($1,$2,$3)', [tx.id, buyerId, 'OTHER1234567']),
  ).rejects.toThrow('mismatch');
  expect((await data('buyer', `pacts/${pactId}/receipts`)).length).toBe(0);
});
it('blocks revoked and wrong-merchant capture, then records one confirmed shared receipt', async () => {
  orderStatus = 'APPROVED';
  revoked = true;
  expect((await request('buyer', `pacts/${pactId}/payment/capture`, {})).status).toBe(409);
  expect(captured).toBe(0);
  revoked = false;
  wrongMerchant = true;
  expect((await request('buyer', `pacts/${pactId}/payment/capture`, {})).status).toBe(409);
  expect(captured).toBe(0);
  wrongMerchant = false;
  const response = await request('buyer', `pacts/${pactId}/payment/capture`, {});
  expect(response.status).toBe(201);
  const op = (await response.json()).data;
  await jobs.payment(op.id);
  await jobs.payment(op.id);
  expect(captured).toBe(1);
  const event = (
    await db.query(
      "INSERT INTO paypal_webhook_events(provider_event_id,event_type,verification_status,payload) VALUES($1,'PAYMENT.CAPTURE.COMPLETED','VERIFIED',$2) RETURNING id",
      [
        'test-market-' + group,
        JSON.stringify({
          resource: { id: captureId, supplementary_data: { related_ids: { order_id: orderId } } },
        }),
      ],
    )
  ).rows[0];
  await jobs.webhook(event.id);
  await jobs.webhook(event.id);
  for (const who of ['buyer', 'seller']) {
    const receipts = await data(who, `pacts/${pactId}/receipts`);
    expect(receipts.length).toBe(1);
    const receipt = await data(who, `pacts/${pactId}/receipts/payment/${receipts[0].id}`);
    expect(receipt.merchantId).toBe(merchant);
    expect(receipt.amountMinor).toBe('2500');
  }
});
it('lets the buyer also publish a service, without changing their existing agreement role', async () => {
  const res = await request('buyer', 'services', {
    ...service,
    title: 'Buyer also offers development',
    requestId: crypto.randomUUID(),
  });
  expect(res.status).toBe(201);
  const detail = await data('buyer', `pacts/${pactId}`);
  expect(detail.parties.find((p: { user_id: string }) => p.user_id === buyerId).role).toBe(
    'PARTY_A',
  );
});
it('supports independent human adjudication and one connected-merchant refund without seller veto', async () => {
  await db.query(
    "UPDATE paypal_transactions SET status='PROVIDER_ACCEPTED' WHERE transaction_id=$1 AND operation='ORDER'",
    [txid],
  );
  wrongMerchant = true;
  expect((await request('buyer', `pacts/${pactId}/payment/refresh`, {})).status).toBe(409);
  wrongMerchant = false;
  expect((await request('buyer', `pacts/${pactId}/payment/refresh`, {})).status).toBe(201);
  expect(
    (
      await db.query(
        "SELECT status FROM paypal_transactions WHERE transaction_id=$1 AND operation='ORDER'",
        [txid],
      )
    ).rows[0].status,
  ).toBe('CONFIRMED');
  expect((await data('staff', 'me/paypal')).status).toBe('NOT_CONNECTED');
  const opened = await request('buyer', `pacts/${pactId}/support`, {
    requestId: crypto.randomUUID(),
    kind: 'REFUND',
    reason: 'The agreed service has not been delivered. Please hear both parties.',
  });
  expect(opened.status).toBe(201);
  const cid = (await opened.json()).data.id;
  expect((await request('buyer', `staff/cases/${cid}/claim`, {})).status).toBe(403);
  expect((await request('staff', `staff/cases/${cid}/claim`, {})).status).toBe(201);
  for (const [who, id] of [
    ['buyer', buyerId],
    ['seller', sellerId],
  ]) {
    expect(
      (
        await request('staff', `staff/cases/${cid}/messages`, {
          requestId: crypto.randomUUID(),
          audienceId: id,
          body: 'Please explain what happened and provide any supporting evidence.',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(who!, `support/${cid}/messages`, {
          requestId: crypto.randomUUID(),
          body:
            who === 'buyer'
              ? 'I did not receive the agreed deliverable.'
              : 'I have not delivered the resume and I disagree with a refund.',
        })
      ).status,
    ).toBe(201);
  }
  const current = await data('staff', `staff/cases/${cid}`);
  const decided = await request('staff', `staff/cases/${cid}/decision`, {
    expectedVersion: current.version,
    expectedEvidenceVersionIds: [],
    type: 'FULL_REFUND',
    reason: 'Both sides were heard. The seller confirms the agreed resume was not delivered.',
  });
  expect(decided.status).toBe(201);
  const op = (await decided.json()).data.operation;
  await jobs.payment(op.id);
  await jobs.payment(op.id);
  expect(refunds).toBe(1);
  const event = (
    await db.query(
      "INSERT INTO paypal_webhook_events(provider_event_id,event_type,verification_status,payload) VALUES($1,'PAYMENT.CAPTURE.REFUNDED','VERIFIED',$2) RETURNING id",
      [
        'test-market-refund-' + group,
        JSON.stringify({
          resource: {
            id: refundId,
            supplementary_data: { related_ids: { capture_id: captureId } },
          },
        }),
      ],
    )
  ).rows[0];
  await jobs.webhook(event.id);
  for (const who of ['buyer', 'seller']) {
    const receipts = await data(who, `pacts/${pactId}/receipts`);
    expect(receipts.length).toBe(2);
    const refund = receipts.find((r: { kind: string }) => r.kind === 'refund');
    expect((await data(who, `pacts/${pactId}/receipts/refund/${refund.id}`)).amountMinor).toBe(
      '2500',
    );
    expect((await data(who, `pacts/${pactId}`)).status).toBe('RESOLVED');
  }
  expect(
    (
      await request('buyer', `pacts/${pactId}/review`, {
        stars: 2,
        body: 'The service was not delivered. Human review resolved the refund.',
      })
    ).status,
  ).toBe(201);
  const listing = await data(null, `marketplace/${listingId}`);
  expect(listing.review_count).toBe(1);
  expect(listing.average_rating).toBe('2.0');
});
it('supports explicitly selected direct connected agreements only with a verified bound recipient', async () => {
  const input = {
    paymentMode: 'CONNECTED',
    title: 'A direct backend resume agreement',
    counterpartyEmail: `seller-${group}@example.test`,
    agreement: 'Create a backend engineering resume from the supplied candidate information.',
    money: { amountMinor: '2500', currency: 'USD' },
    payerRole: 'PARTY_A',
    paymentCondition: 'After both members review and accept this agreement.',
    commitments: [
      {
        title: 'Backend engineering resume',
        description: service.description,
        acceptanceCriteria: service.acceptanceCriteria,
        expectedEvidence: service.expectedEvidence,
        milestones: [],
      },
    ],
  };
  const key = crypto.randomUUID();
  const made = await request('buyer', 'services/direct-agreement/create', input, key);
  expect(made.status).toBe(201);
  const id = (await made.json()).data.id;
  expect(
    (await (await request('buyer', 'services/direct-agreement/create', input, key)).json()).data.id,
  ).toBe(id);
  const detail = await data('buyer', `pacts/${id}`);
  expect(detail.transaction.payment_route).toBe('CONNECTED');
  expect(detail.commitments[0].promised_by).toBe(sellerId);
  const tx = (
    await db.query('SELECT payee_user_id,payee_merchant_id FROM transactions WHERE pact_id=$1', [
      id,
    ])
  ).rows[0];
  expect(tx).toMatchObject({ payee_user_id: sellerId, payee_merchant_id: merchant });
  expect(
    (
      await request(
        'buyer',
        'services/direct-agreement/create',
        { ...input, paymentMode: 'LEGACY' },
        crypto.randomUUID(),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await request(
        'buyer',
        'services/direct-agreement/create',
        { ...input, counterpartyEmail: `unknown-${group}@example.test` },
        crypto.randomUUID(),
      )
    ).status,
  ).toBe(409);
});
