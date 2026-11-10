import 'reflect-metadata';
import { beforeAll, afterAll, it, expect } from 'vitest';
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
const oldReviewers = process.env.PACT_REVIEWER_SUBJECTS;
const oldWorkers = process.env.WORKERS_ENABLED;
let app: INestApplication,
  db: Database,
  jobs: LifecycleJobs,
  origin: string,
  pid: string,
  cid: string,
  opid: string,
  sellerId: string,
  txid: string,
  capture: string;
let refunded = false,
  calls = 0;
const amount = { currency_code: 'USD', value: '25.00' };
const paypal = {
  enabled: () => true,
  getCapture: async () => ({ id: capture, status: refunded ? 'REFUNDED' : 'COMPLETED', amount }),
  refund: async () => {
    calls++;
    refunded = true;
    return { id: 'TESTREFUND' + group.replaceAll('-', ''), status: 'COMPLETED', amount };
  },
  getRefund: async () => ({
    id: 'TESTREFUND' + group.replaceAll('-', ''),
    status: 'COMPLETED',
    amount,
    links: [
      { rel: 'up', href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${capture}` },
    ],
  }),
  getOrder: async () => ({
    id: 'TESTORDER' + group.replaceAll('-', ''),
    intent: 'CAPTURE',
    status: 'COMPLETED',
    purchase_units: [
      {
        custom_id: txid,
        amount,
        payee: { merchant_id: 'TEST-MERCHANT' },
        payments: { captures: [{ id: capture, status: 'COMPLETED', amount }] },
      },
    ],
  }),
};
const identities: Record<string, { id: string; subject: string; email: string; name: string }> = {};
async function request(who: string, path: string, body?: unknown, key?: string) {
  return fetch(`${origin}/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${who}.test.signature`,
      'content-type': 'application/json',
      ...(key ? { 'idempotency-key': key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function data(who: string, path: string) {
  const response = await request(who, path);
  expect(response.status).toBe(200);
  return (await response.json()).data;
}
beforeAll(async () => {
  process.env.PACT_REVIEWER_SUBJECTS = `support-${group}-staff`;
  process.env.WORKERS_ENABLED = 'true';
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(IdentityVerifier)
    .useValue({
      verify: async (token: string) => {
        const who = token.split('.')[0];
        return {
          subject: `support-${group}-${who}`,
          email: `${who}-${group}@example.test`,
          name: who,
        };
      },
    })
    .overrideProvider(PayPalProvider)
    .useValue(paypal)
    .overrideProvider(JobRuntime)
    .useValue({})
    .compile();
  app = mod.createNestApplication();
  app.useGlobalFilters(new HttpErrorFilter());
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
  db = mod.get(Database);
  jobs = mod.get(LifecycleJobs);
  for (const who of ['buyer', 'seller', 'staff', 'outsider'])
    identities[who] = await data(who, 'me');
  const response = await request(
    'buyer',
    'pacts',
    {
      title: 'Human review integration fixture',
      counterpartyEmail: identities.seller.email,
      agreement: 'Deliver a backend resume with skills and projects.',
      money: { amountMinor: '2500', currency: 'USD' },
      payerRole: 'PARTY_A',
      paymentCondition: 'Payment for delivery.',
      commitments: [
        {
          title: 'Backend resume',
          description: 'Deliver a resume for a backend developer.',
          acceptanceCriteria: 'Skills and backend projects.',
          expectedEvidence: 'The resume document.',
        },
      ],
    },
    crypto.randomUUID(),
  );
  expect(response.status).toBe(201);
  pid = (await response.json()).data.id;
  const invitation = (await data('seller', 'me/invitations')).find(
    (v: { pact_id: string }) => v.pact_id === pid,
  );
  expect((await request('seller', `invitations/${invitation.id}/accept`, {})).status).toBe(201);
  sellerId = identities.seller.id;
  capture = 'TESTCAPTURE' + group.replaceAll('-', '');
  txid = (
    await db.query(
      "UPDATE transactions SET state='CAPTURED',capture_id=$2,order_id=$3 WHERE pact_id=$1 RETURNING id",
      [pid, capture, 'TESTORDER' + group.replaceAll('-', '')],
    )
  ).rows[0].id;
}, 60000);
afterAll(async () => {
  if (db) {
    const fixtures = (
      await db.query(
        "SELECT r.id FROM seller_reviews r JOIN pacts p ON p.id=r.pact_id JOIN users u ON u.id=r.author_id WHERE p.title='Human review integration fixture' AND u.email LIKE '%@example.test' AND NOT EXISTS(SELECT 1 FROM review_moderation m WHERE m.review_id=r.id)",
      )
    ).rows;
    for (const row of fixtures)
      await request('staff', `staff/reviews/${row.id}/hide`, {
        reason: 'Integration fixture excluded from actual seller reputation.',
      });
  }
  await app?.close();
  if (oldReviewers === undefined) delete process.env.PACT_REVIEWER_SUBJECTS;
  else process.env.PACT_REVIEWER_SUBJECTS = oldReviewers;
  if (oldWorkers === undefined) delete process.env.WORKERS_ENABLED;
  else process.env.WORKERS_ENABLED = oldWorkers;
});
it('opens an idempotent payer refund case and rejects outsiders and altered request identifiers', async () => {
  expect(
    (
      await request('outsider', `pacts/${pid}/support`, {
        requestId: crypto.randomUUID(),
        kind: 'REFUND',
        reason: 'The delivery never arrived.',
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await request('seller', `pacts/${pid}/support`, {
        requestId: crypto.randomUUID(),
        kind: 'REFUND',
        reason: 'The delivery never arrived.',
      })
    ).status,
  ).toBe(403);
  expect((await data('buyer', `pacts/${pid}/support/availability`)).configured).toBe(true);
  const body = {
    requestId: crypto.randomUUID(),
    kind: 'REFUND',
    reason: 'The seller did not provide the agreed delivery.',
  };
  const a = await request('buyer', `pacts/${pid}/support`, body);
  expect(a.status).toBe(201);
  cid = (await a.json()).data.id;
  expect((await (await request('buyer', `pacts/${pid}/support`, body)).json()).data.id).toBe(cid);
  expect(
    (await request('buyer', `pacts/${pid}/support`, { ...body, reason: 'Changed request reason.' }))
      .status,
  ).toBe(409);
  expect((await request('outsider', `support/${cid}`)).status).toBe(404);
});
it('restricts staff authority and prevents a reviewer judging their own Pact', async () => {
  expect((await request('buyer', `staff/cases/${cid}/claim`, {})).status).toBe(403);
  process.env.PACT_REVIEWER_SUBJECTS += ',' + identities.buyer.subject;
  expect((await request('buyer', `staff/cases/${cid}/claim`, {})).status).toBe(403);
  process.env.PACT_REVIEWER_SUBJECTS = identities.staff.subject;
  expect((await request('staff', `staff/cases/${cid}/claim`, {})).status).toBe(201);
});
it('keeps buyer and seller conversations private, rejects foreign evidence and deduplicates messages', async () => {
  const buyer = { requestId: crypto.randomUUID(), body: 'Buyer private explanation.' };
  expect((await request('buyer', `support/${cid}/messages`, buyer)).status).toBe(201);
  const count = (await data('buyer', `support/${cid}`)).messages.length;
  expect((await request('buyer', `support/${cid}/messages`, buyer)).status).toBe(201);
  expect((await data('buyer', `support/${cid}`)).messages.length).toBe(count);
  expect(
    (
      await request('seller', `support/${cid}/messages`, {
        requestId: crypto.randomUUID(),
        body: 'Seller private explanation.',
      })
    ).status,
  ).toBe(201);
  const buyerRead = await data('buyer', `support/${cid}`);
  expect(buyerRead.messages.map((v: { body: string }) => v.body)).not.toContain(
    'Seller private explanation.',
  );
  expect(
    (
      await request('buyer', `support/${cid}/messages`, {
        requestId: crypto.randomUUID(),
        body: 'Forged evidence reference.',
        evidenceVersionIds: [crypto.randomUUID()],
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await request('buyer', `support/${cid}/messages`, {
        requestId: crypto.randomUUID(),
        body: 'Wrong audience.',
        audienceId: sellerId,
      })
    ).status,
  ).toBe(403);
  expect((await data('staff', `staff/cases/${cid}`)).pact.agreement).toContain('backend resume');
});
it('requires hearing both parties and rejects stale decisions before queueing a staff refund', async () => {
  const c = await data('staff', `staff/cases/${cid}`);
  const decision = {
    expectedVersion: c.version,
    expectedEvidenceVersionIds: [],
    type: 'FULL_REFUND',
    reason: 'Both sides were reviewed and the agreed delivery was not supplied.',
  };
  expect((await request('staff', `staff/cases/${cid}/decision`, decision)).status).toBe(409);
  for (const party of ['buyer', 'seller'])
    expect(
      (
        await request('staff', `staff/cases/${cid}/messages`, {
          requestId: crypto.randomUUID(),
          audienceId: identities[party].id,
          body: 'Please explain your side and supply any supporting evidence.',
        })
      ).status,
    ).toBe(201);
  expect((await request('staff', `staff/cases/${cid}/decision`, decision)).status).toBe(409);
  const fresh = await data('staff', `staff/cases/${cid}`);
  const result = await request('staff', `staff/cases/${cid}/decision`, {
    ...decision,
    expectedVersion: fresh.version,
  });
  expect(result.status).toBe(201);
  opid = (await result.json()).data.operation.id;
  expect(
    (
      await db.query(
        'SELECT count(*)::int n FROM approvals a JOIN resolutions r ON r.id=a.resolution_id WHERE r.pact_id=$1',
        [pid],
      )
    ).rows[0].n,
  ).toBe(0);
  expect(
    (
      await request('buyer', `pacts/${pid}/resolutions`, {
        type: 'NO_ACTION',
        reason: 'Trying to stop the staff refund.',
        expectedVersion: 1,
      })
    ).status,
  ).toBe(409);
});
it('rejects revoked staff authority, executes a valid refund once and preserves ambiguous outcome safety', async () => {
  process.env.PACT_REVIEWER_SUBJECTS = '';
  await expect(jobs.payment(opid)).rejects.toThrow();
  expect(calls).toBe(0);
  process.env.PACT_REVIEWER_SUBJECTS = identities.staff.subject;
  await jobs.payment(opid);
  await jobs.payment(opid);
  expect(calls).toBe(1);
  expect(
    (await db.query('SELECT status FROM paypal_transactions WHERE id=$1', [opid])).rows[0].status,
  ).toBe('PROVIDER_ACCEPTED');
  expect(
    (await db.query('SELECT state FROM transactions WHERE pact_id=$1', [pid])).rows[0].state,
  ).toBe('CAPTURED');
});
it('lets either member confirm the already-submitted staff refund without another financial POST', async () => {
  const result = await request('seller', `pacts/${pid}/payment/refresh`, {});
  expect(result.status).toBe(201);
  expect((await result.json()).data.status).toBe('CONFIRMED');
  expect(calls).toBe(1);
  const p = await data('buyer', `pacts/${pid}`);
  expect(p.status).toBe('RESOLVED');
  expect(p.transaction.state).toBe('COMPLETED');
  expect(
    (await data('seller', `pacts/${pid}/receipts`)).some(
      (r: { kind: string }) => r.kind === 'refund',
    ),
  ).toBe(true);
});
it('publishes one verified payer review after settlement and prevents fake or self reviews', async () => {
  expect(
    (
      await request('seller', `pacts/${pid}/review`, {
        stars: 5,
        body: 'Self review is forbidden.',
      })
    ).status,
  ).toBe(403);
  const review = { stars: 2, body: 'Delivery was not supplied; reviewer resolved the refund.' };
  const response = await request('buyer', `pacts/${pid}/review`, review);
  expect(response.status).toBe(201);
  expect((await request('buyer', `pacts/${pid}/review`, review)).status).toBe(201);
  expect(
    (
      await request('buyer', `pacts/${pid}/review`, {
        stars: 5,
        body: 'A different duplicate review.',
      })
    ).status,
  ).toBe(409);
  expect((await data('outsider', `sellers/${sellerId}`)).reviews).toHaveLength(1);
  expect((await request('outsider', `pacts/${pid}/review`)).status).toBe(404);
});

it('allows independent staff moderation without changing the immutable review', async () => {
  const reviews = await data('staff', `sellers/${sellerId}`);
  const rid = reviews.reviews[0].id;
  expect(
    (
      await request('seller', `staff/reviews/${rid}/hide`, {
        reason: 'Trying to hide my own poor review.',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await request('staff', `staff/reviews/${rid}/hide`, {
        reason: 'Integration fixture excluded from real seller reputation.',
      })
    ).status,
  ).toBe(201);
  expect((await data('outsider', `sellers/${sellerId}`)).reviews).toHaveLength(0);
  expect(
    (await db.query('SELECT count(*)::int n FROM seller_reviews WHERE id=$1', [rid])).rows[0].n,
  ).toBe(1);
});

it('requires the assigned response deadline and an explicit nonresponse explanation', async () => {
  const created = await request(
    'buyer',
    'pacts',
    {
      title: 'Nonresponse integration fixture',
      counterpartyEmail: identities.seller.email,
      agreement: 'Deliver a backend resume with skills and projects.',
      money: { amountMinor: '2500', currency: 'USD' },
      payerRole: 'PARTY_A',
      paymentCondition: 'Payment for delivery.',
      commitments: [
        {
          title: 'Backend resume',
          description: 'Deliver a resume for a backend developer.',
          acceptanceCriteria: 'Skills and projects.',
          expectedEvidence: 'Resume document.',
        },
      ],
    },
    crypto.randomUUID(),
  );
  expect(created.status).toBe(201);
  const p = (await created.json()).data.id;
  const invite = (await data('seller', 'me/invitations')).find(
    (v: { pact_id: string }) => v.pact_id === p,
  );
  expect((await request('seller', `invitations/${invite.id}/accept`, {})).status).toBe(201);
  expect(
    (
      await request('buyer', `pacts/${p}/review`, {
        stars: 5,
        body: 'An unpaid review must be denied.',
      })
    ).status,
  ).toBe(403);
  const opened = await request('buyer', `pacts/${p}/support`, {
    requestId: crypto.randomUUID(),
    kind: 'RESOLUTION',
    reason: 'Delivery terms need a human review.',
  });
  const c = (await opened.json()).data.id;
  expect((await request('staff', `staff/cases/${c}/claim`, {})).status).toBe(201);
  for (const who of ['buyer', 'seller'])
    expect(
      (
        await request('staff', `staff/cases/${c}/messages`, {
          requestId: crypto.randomUUID(),
          audienceId: identities[who].id,
          body: 'Please explain your side of this agreement.',
        })
      ).status,
    ).toBe(201);
  await request('buyer', `support/${c}/messages`, {
    requestId: crypto.randomUUID(),
    body: 'Buyer supplied their explanation.',
  });
  const current = await data('staff', `staff/cases/${c}`);
  const decision = {
    expectedVersion: current.version,
    expectedEvidenceVersionIds: [],
    type: 'NO_ACTION',
    reason: 'The record was reviewed and no captured money can be refunded.',
    responseOverrideReason: 'The seller did not respond within the recorded response window.',
  };
  expect((await request('staff', `staff/cases/${c}/decision`, decision)).status).toBe(409);
  await db.query("UPDATE support_cases SET response_deadline=now()-interval '1 hour' WHERE id=$1", [
    c,
  ]);
  const { responseOverrideReason: _, ...withoutExplanation } = decision;
  void _;
  expect((await request('staff', `staff/cases/${c}/decision`, withoutExplanation)).status).toBe(
    409,
  );
  expect((await request('staff', `staff/cases/${c}/decision`, decision)).status).toBe(201);
  expect((await data('seller', `support/${c}`)).decision.response_override_reason).toBe(
    decision.responseOverrideReason,
  );
  expect((await data('buyer', `pacts/${p}`)).status).toBe('RESOLVED');
  expect(
    (
      await db.query(
        'SELECT count(*)::int n FROM paypal_transactions op JOIN transactions t ON t.id=op.transaction_id WHERE t.pact_id=$1',
        [p],
      )
    ).rows[0].n,
  ).toBe(0);
});
