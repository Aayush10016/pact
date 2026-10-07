import 'reflect-metadata';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { AppModule } from '../src/app.module';
import { Database } from '../src/database/database.module';
import { IdentityVerifier } from '../src/auth/auth.module';
import { EvidenceStorage } from '../src/evidence/storage';
import { EvidenceScanner } from '../src/evidence/scanner';
import { PayPalProvider, decimalAmount, ProviderError } from '../src/payments/paypal.provider';
import { JobRuntime } from '../src/jobs/jobs.module';
import { LifecycleJobs } from '../src/jobs/lifecycle-jobs';
import { HttpErrorFilter } from '../src/common/http-error.filter';
const group = crypto.randomUUID();
const blobs = new Map<string, Buffer>();
// External-provider doubles are isolated to this test module. Persistence, ownership,
// approval/version rules, idempotency, webhook processing, and audit writes use real services/SQL.
const storage = {
  enabled: () => true,
  put: async (key: string, path: string) => {
    blobs.set(key, await readFile(path));
  },
  read: async (key: string) => blobs.get(key)!,
  download: async () => 'https://test-only.invalid/private-download',
  remove: async (key: string) => {
    blobs.delete(key);
  },
};
let txId: string;
let captured = false;
let refunded = false;
let refundCalls = 0;
let captureCalls = 0;
let orderCalls = 0;
let orderId = `ORDER${group.replaceAll('-', '').slice(0, 16)}`;
let captureId = `CAP${group.replaceAll('-', '').slice(0, 16)}`;
let refundId = `REF${group.replaceAll('-', '').slice(0, 16)}`;
let refundMinor = '765';
let ambiguousRefund = false;
const amount = { currency_code: 'USD', value: '25.50' };
const paypal = {
  enabled: () => true,
  createOrder: async (id: string) => {
    txId = id;
    orderCalls++;
    return {
      id: orderId,
      status: 'CREATED',
      links: [
        {
          rel: 'payer-action',
          href: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`,
        },
      ],
    };
  },
  getOrder: async () => ({
    id: orderId,
    status: captured ? 'COMPLETED' : 'APPROVED',
    purchase_units: [
      {
        custom_id: txId,
        amount,
        payments: { captures: captured ? [{ id: captureId, status: 'COMPLETED', amount }] : [] },
      },
    ],
  }),
  capture: async () => {
    captureCalls++;
    captured = true;
    return paypal.getOrder();
  },
  getCapture: async () => ({
    id: captureId,
    status: refunded ? 'PARTIALLY_REFUNDED' : 'COMPLETED',
    amount,
    supplementary_data: { related_ids: { order_id: orderId } },
  }),
  refund: async (_id: string, minor: string) => {
    refundCalls++;
    refunded = true;
    refundMinor = minor;
    if (ambiguousRefund) throw new ProviderError(true);
    return {
      id: refundId,
      status: 'COMPLETED',
      amount: { currency_code: 'USD', value: decimalAmount(minor) },
    };
  },
  getRefund: async () => ({
    id: refundId,
    status: 'COMPLETED',
    amount: { currency_code: 'USD', value: decimalAmount(refundMinor) },
    links: [
      { rel: 'up', href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${captureId}` },
    ],
  }),
  verify: async (headers: Record<string, string>) =>
    headers['paypal-transmission-sig'] === 'test-valid',
};
let app: INestApplication;
let db: Database;
let jobs: LifecycleJobs;
let origin: string;
let pactId: string;
let commitmentId: string;
let evidenceId: string;
let versionId: string;
let userA: string;
const body = {
  title: 'Security lifecycle agreement',
  counterpartyEmail: `b-${group}@example.test`,
  agreement: 'Deliver a complete editable brand package with documented exports.',
  money: { amountMinor: '2550', currency: 'USD' },
  payerRole: 'PARTY_B',
  paymentCondition: 'Both parties must explicitly approve the agreed resolution.',
  commitments: [
    {
      title: 'Brand package',
      description: 'Provide the complete source and exported identity files.',
      acceptanceCriteria: 'Source files and agreed exports.',
      expectedEvidence: 'Dated delivery with source files.',
      milestones: [{ title: 'Delivery' }],
    },
  ],
};
beforeAll(async () => {
  vi.stubEnv('WORKERS_ENABLED', 'true');
  vi.stubEnv('AI_SERVICE_URL', 'http://ai.test');
  vi.stubEnv('AI_SERVICE_KEY', 'test-only');
  const original = globalThis.fetch;
  vi.stubGlobal('fetch', async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
    if (String(url).startsWith('http://ai.test')) {
      if (String(url).endsWith('/v1/extract'))
        return Response.json({
          data: { text: 'A dated delivery receipt; source assets are missing.' },
        });
      const input = JSON.parse(String(options?.body));
      return Response.json({
        model: 'nvidia/test-model',
        data: {
          status: 'UNCLEAR',
          confidence: 0.3,
          supportingEvidence: [input.evidence[0].id],
          conflictingEvidence: [],
          missingEvidence: ['Source files'],
          reasoningSummary: 'Insufficient evidence of full delivery.',
          recommendation: { type: 'REQUEST_EVIDENCE' },
          commitments: input.commitments.map((c: { id: string }) => ({
            commitmentId: c.id,
            status: 'UNCLEAR',
            evidenceIds: [input.evidence[0].id],
            claim: 'A dated delivery receipt; source assets are missing.',
            citations: [
              {
                evidenceId: input.evidence[0].id,
                quote: 'A dated delivery receipt; source assets are missing.',
              },
            ],
            inference: 'Complete source delivery is not established.',
            uncertainty: 'Source assets are missing.',
          })),
        },
      });
    }
    return original(url, options);
  });
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(IdentityVerifier)
    .useValue({
      verify: async (token: string) => {
        const who = token.split('.')[0];
        if (!['a', 'b', 'outside'].includes(who)) throw new ForbiddenException();
        return {
          subject: `security-${group}-${who}`,
          email: `${who}-${group}@example.test`,
          name: `Security test ${who}`,
        };
      },
    })
    .overrideProvider(EvidenceStorage)
    .useValue(storage)
    .overrideProvider(EvidenceScanner)
    .useValue({ scan: async () => 'CLEAN' })
    .overrideProvider(PayPalProvider)
    .useValue(paypal)
    .overrideProvider(JobRuntime)
    .useValue({})
    .compile();
  app = module.createNestApplication();
  app.useGlobalFilters(new HttpErrorFilter());
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
  db = module.get(Database);
  jobs = module.get(LifecycleJobs);
}, 60000);
afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function request(who: string, path: string, value?: unknown, key?: string) {
  const multipart = value instanceof FormData;
  return fetch(`${origin}/v1/${path}`, {
    method: value === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${who}.test.signature`,
      ...(!multipart ? { 'content-type': 'application/json' } : {}),
      ...(key ? { 'idempotency-key': key } : {}),
    },
    body: value === undefined ? undefined : multipart ? value : JSON.stringify(value),
  });
}
async function detail() {
  return (await (await request('a', `pacts/${pactId}`)).json()).data;
}
function file(commitment = commitmentId, requestId = crypto.randomUUID()) {
  const data = new FormData();
  data.set(
    'metadata',
    JSON.stringify({
      title: 'Delivery receipt',
      commitmentId: commitment,
      occurredAt: new Date().toISOString(),
      requestId,
    }),
  );
  data.set(
    'file',
    new Blob(['A dated delivery receipt.'], { type: 'text/plain' }),
    '../../untrusted.txt',
  );
  return data;
}
const headers = {
  'content-type': 'application/json',
  'paypal-transmission-id': 'test-transmission',
  'paypal-transmission-time': new Date().toISOString(),
  'paypal-transmission-sig': 'test-valid',
  'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/test-cert',
  'paypal-auth-algo': 'SHA256withRSA',
};
async function webhook(eventId: string, type: string, resource: unknown, valid = true) {
  return fetch(`${origin}/v1/webhooks/paypal`, {
    method: 'POST',
    headers: { ...headers, 'paypal-transmission-sig': valid ? 'test-valid' : 'fake' },
    body: JSON.stringify({ id: eventId, event_type: type, resource }),
  });
}
async function processReceipt(eventId: string) {
  const row = (
    await db.query('SELECT id FROM paypal_webhook_events WHERE provider_event_id=$1', [eventId])
  ).rows[0];
  await jobs.webhook(row.id);
}
it('creates real records and a verified-email invitation without authorizing payment', async () => {
  pactId = (await (await request('a', 'pacts', body, crypto.randomUUID())).json()).data.id;
  const invitation = (await (await request('b', 'me/invitations')).json()).data.find(
    (i: { pact_id: string }) => i.pact_id === pactId,
  );
  expect((await request('outside', `invitations/${invitation.id}`)).status).toBe(403);
  expect((await request('b', `invitations/${invitation.id}`)).status).toBe(200);
  await request('b', `invitations/${invitation.id}/accept`, {});
  const p = await detail();
  commitmentId = p.commitments[0].id;
  userA = p.parties.find((r: { role: string }) => r.role === 'PARTY_A').user_id;
  expect(p.status).toBe('ACTIVE');
  expect(p.transaction.state).toBe('CREATED');
});
it('enforces private evidence membership, association and uploader-only versioning', async () => {
  expect((await request('outside', `pacts/${pactId}/evidence`, file())).status).toBe(404);
  expect(blobs.size).toBe(0);
  expect((await request('a', `pacts/${pactId}/evidence`, file(crypto.randomUUID()))).status).toBe(
    404,
  );
  vi.stubEnv('WORKERS_ENABLED', 'false');
  try {
    expect((await request('a', `pacts/${pactId}/evidence`, file())).status).toBe(503);
    expect((await detail()).evidence).toHaveLength(0);
    expect(blobs.size).toBe(0);
  } finally {
    vi.stubEnv('WORKERS_ENABLED', 'true');
  }
  const upload = await request('a', `pacts/${pactId}/evidence`, file());
  expect(upload.status).toBe(201);
  const output = (await upload.json()).data;
  evidenceId = output.evidenceId;
  versionId = output.id;
  expect(
    (await request('outside', `pacts/${pactId}/evidence/versions/${versionId}/download`)).status,
  ).toBe(404);
  expect(
    (await request('b', `pacts/${pactId}/evidence/${evidenceId}/versions`, file())).status,
  ).toBe(403);
  await expect(
    db.query("UPDATE evidence_versions SET object_key='changed' WHERE id=$1", [versionId]),
  ).rejects.toThrow(/immutable|permission denied/);
  await jobs.evidence(versionId);
  expect((await detail()).evidence[0].versions[0].state).toBe('READY');
});
it('processes strict advisory assessments and never authorizes money from AI output', async () => {
  const response = await request('a', `pacts/${pactId}/assessments`, {
    requestId: crypto.randomUUID(),
  });
  expect(response.status).toBe(201);
  const analysis = (await response.json()).data;
  await jobs.assessment(analysis.id);
  const p = await detail();
  expect(p.analyses[0].state).toBe('READY');
  expect(p.transaction.state).toBe('CREATED');
  expect(refundCalls).toBe(0);
});
it('uses payer ownership and stable operation IDs; capture response cannot confirm money', async () => {
  expect((await request('a', `pacts/${pactId}/payment/order`, {})).status).toBe(403);
  const order = (await (await request('b', `pacts/${pactId}/payment/order`, {})).json()).data;
  expect((await (await request('b', `pacts/${pactId}/payment/order`, {})).json()).data.id).toBe(
    order.id,
  );
  await jobs.payment(order.id);
  await jobs.payment(order.id);
  expect(orderCalls).toBe(1);
  const readback = vi.spyOn(paypal, 'getOrder').mockRejectedValue(
    new ProviderError(false, {
      http: 404,
      name: 'RESOURCE_NOT_FOUND',
      issue: 'INVALID_RESOURCE_ID',
    }),
  );
  const unavailable = await request('b', `pacts/${pactId}/payment/capture`, {});
  expect(unavailable.status).toBe(409);
  expect((await unavailable.json()).error.message).toContain('stored order');
  const staleCheckout = await request('b', `pacts/${pactId}/payment/order`, {});
  expect(staleCheckout.status).toBe(409);
  expect((await staleCheckout.json()).error.reason).toBe('PAYPAL_ORDER_UNAVAILABLE');
  expect(orderCalls).toBe(1);
  expect((await detail()).transaction.order_id).toBe(orderId);
  expect(captureCalls).toBe(0);
  expect(
    (
      await db.query(
        "SELECT id FROM paypal_transactions WHERE transaction_id=$1 AND operation='CAPTURE'",
        [txId],
      )
    ).rowCount,
  ).toBe(0);
  expect(
    (await detail()).audit.some(
      (e: { event_type: string }) => e.event_type === 'PAYMENT_PREFLIGHT_FAILED',
    ),
  ).toBe(true);
  readback.mockRestore();
  expect((await (await request('b', `pacts/${pactId}/payment/order`, {})).json()).data.id).toBe(
    order.id,
  );
  const capture = (await (await request('b', `pacts/${pactId}/payment/capture`, {})).json()).data;
  const duplicates = await Promise.all(
    Array.from({ length: 4 }, () => request('b', `pacts/${pactId}/payment/capture`, {})),
  );
  for (const response of duplicates) expect((await response.json()).data.id).toBe(capture.id);
  await jobs.payment(capture.id);
  await jobs.payment(capture.id);
  expect(captureCalls).toBe(1);
  expect((await detail()).transaction.state).toBe('CREATED');
});
it('rejects fake webhooks and confirms capture only from verified, ownership-matched provider facts', async () => {
  const fakeId = `FAKE-${group}`;
  expect(
    (await webhook(fakeId, 'PAYMENT.CAPTURE.COMPLETED', { id: captureId }, false)).status,
  ).toBe(403);
  expect(
    (await db.query('SELECT id FROM paypal_webhook_events WHERE provider_event_id=$1', [fakeId]))
      .rowCount,
  ).toBe(0);
  const eventId = `CAPTURE-${group}`;
  const resource = { id: captureId, supplementary_data: { related_ids: { order_id: orderId } } };
  expect((await webhook(eventId, 'PAYMENT.CAPTURE.COMPLETED', resource)).status).toBe(200);
  await processReceipt(eventId);
  expect((await detail()).transaction.state).toBe('CAPTURED');
  const repeated = await request('b', `pacts/${pactId}/payment/capture`, {});
  expect(repeated.status).toBe(201);
  expect((await repeated.json()).data.status).toBe('CONFIRMED');
  expect(captureCalls).toBe(1);
  await webhook(eventId, 'PAYMENT.CAPTURE.COMPLETED', resource);
  await processReceipt(eventId);
  expect(
    (await db.query('SELECT id FROM paypal_webhook_events WHERE provider_event_id=$1', [eventId]))
      .rowCount,
  ).toBe(1);
});
let resolutionId: string;
async function propose(expectedVersion: number, reason: string) {
  const response = await request('a', `pacts/${pactId}/resolutions`, {
    type: 'PARTIAL_REFUND',
    percentage: 30,
    reason,
    expectedVersion,
  });
  expect(response.status).toBe(201);
  return (await response.json()).data.id as string;
}
async function approveBoth(rid: string) {
  const r = (await detail()).resolutions.find((r: { id: string }) => r.id === rid);
  for (const who of ['a', 'b'])
    expect(
      (
        await request(who, `pacts/${pactId}/resolutions/${rid}/decision`, {
          decision: 'APPROVED',
          version: r.version,
          proposalSha256: r.proposal.proposalSha256,
        })
      ).status,
    ).toBe(201);
}
it('denies impersonated, unauthorized, stale and missing approvals', async () => {
  const p = await detail();
  await request('b', `pacts/${pactId}/transition`, {
    status: 'DISPUTED',
    expectedVersion: p.version,
  });
  resolutionId = await propose(0, 'Source assets are missing; propose a thirty percent refund.');
  const r = (await detail()).resolutions[0];
  expect(
    (
      await request('outside', `pacts/${pactId}/resolutions/${resolutionId}/decision`, {
        decision: 'APPROVED',
        version: r.version,
        proposalSha256: r.proposal.proposalSha256,
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await request('a', `pacts/${pactId}/resolutions/${resolutionId}/decision`, {
        decision: 'APPROVED',
        version: r.version,
        proposalSha256: r.proposal.proposalSha256,
        userId: 'another-user',
      })
    ).status,
  ).toBe(400);
  expect(
    (await request('a', `pacts/${pactId}/resolutions/${resolutionId}/execute`, {})).status,
  ).toBe(403);
  await approveBoth(resolutionId);
  await expect(
    db.query("UPDATE approvals SET decision='REJECTED' WHERE resolution_id=$1 AND user_id=$2", [
      resolutionId,
      userA,
    ]),
  ).rejects.toThrow(/append-only|permission denied/);
  const previous = resolutionId;
  resolutionId = await propose(
    1,
    'Revised explanation of the same partial refund, requiring fresh consent.',
  );
  expect((await request('a', `pacts/${pactId}/resolutions/${previous}/execute`, {})).status).toBe(
    404,
  );
  expect(
    (await request('a', `pacts/${pactId}/resolutions/${resolutionId}/execute`, {})).status,
  ).toBe(403);
  expect(refundCalls).toBe(0);
});
it('cancels queued stale resolutions, executes only once, and waits for refund confirmation', async () => {
  await approveBoth(resolutionId);
  const old = (
    await (await request('a', `pacts/${pactId}/resolutions/${resolutionId}/execute`, {})).json()
  ).data;
  resolutionId = await propose(2, 'Final mutual proposal based on the reviewed delivery record.');
  await jobs.payment(old.id);
  expect(refundCalls).toBe(0);
  await approveBoth(resolutionId);
  const [a, b] = await Promise.all([
    request('a', `pacts/${pactId}/resolutions/${resolutionId}/execute`, {}),
    request('b', `pacts/${pactId}/resolutions/${resolutionId}/execute`, {}),
  ]);
  const op = (await a.json()).data;
  expect((await b.json()).data.id).toBe(op.id);
  await jobs.payment(op.id);
  await jobs.payment(op.id);
  expect(refundCalls).toBe(1);
  expect((await detail()).transaction.state).toBe('CAPTURED');
  expect(
    (
      await request('a', `pacts/${pactId}/resolutions`, {
        type: 'FULL_REFUND',
        reason: 'Attempt to alter an in-flight financial consequence.',
        expectedVersion: 3,
      })
    ).status,
  ).toBe(409);
  const eventId = `REFUND-${group}`;
  await webhook(eventId, 'PAYMENT.CAPTURE.REFUNDED', {
    id: refundId,
    supplementary_data: { related_ids: { capture_id: captureId } },
  });
  await processReceipt(eventId);
  const p = await detail();
  expect(p.status).toBe('RESOLVED');
  expect(p.transaction.state).toBe('COMPLETED');
  expect(p.transaction.refunded_minor).toBe('765');
  expect(
    p.audit.some((a: { event_type: string }) => a.event_type === 'FINANCIAL_ACTION_EXECUTED'),
  ).toBe(true);
  await webhook(eventId, 'PAYMENT.CAPTURE.REFUNDED', { id: refundId });
  await processReceipt(eventId);
  expect((await detail()).transaction.refunded_minor).toBe('765');
});

it('completes an agreed delivery only after both approvals, without refunding the capture', async () => {
  captured = false;
  refunded = false;
  orderId = `HAPPYORDER${group.replaceAll('-', '').slice(0, 12)}`;
  captureId = `HAPPYCAP${group.replaceAll('-', '').slice(0, 12)}`;
  const created = await request(
    'a',
    'pacts',
    { ...body, title: 'Agreed delivery lifecycle' },
    crypto.randomUUID(),
  );
  expect(created.status).toBe(201);
  pactId = (await created.json()).data.id;
  const invitations = (await (await request('b', 'me/invitations')).json()).data;
  const invite = invitations.find((i: { pact_id: string }) => i.pact_id === pactId);
  expect((await request('b', `invitations/${invite.id}/accept`, {})).status).toBe(201);
  const order = (await (await request('b', `pacts/${pactId}/payment/order`, {})).json()).data;
  await jobs.payment(order.id);
  const capture = (await (await request('b', `pacts/${pactId}/payment/capture`, {})).json()).data;
  await jobs.payment(capture.id);
  const eventId = `HAPPY-CAPTURE-${group}`;
  await webhook(eventId, 'PAYMENT.CAPTURE.COMPLETED', {
    id: captureId,
    supplementary_data: { related_ids: { order_id: orderId } },
  });
  await processReceipt(eventId);
  expect((await detail()).transaction.state).toBe('CAPTURED');
  const proposal = await request('a', `pacts/${pactId}/resolutions`, {
    type: 'NO_ACTION',
    reason: 'Both parties reviewed and accepted the complete delivery.',
    expectedVersion: 0,
  });
  expect(proposal.status).toBe(201);
  const rid = (await proposal.json()).data.id;
  expect((await request('a', `pacts/${pactId}/resolutions/${rid}/execute`, {})).status).toBe(403);
  await approveBoth(rid);
  expect((await request('b', `pacts/${pactId}/resolutions/${rid}/execute`, {})).status).toBe(201);
  const p = await detail();
  expect(p.status).toBe('COMPLETED');
  expect(p.transaction.state).toBe('CAPTURED');
  expect(p.transaction.refunded_minor).toBe('0');
  expect(refundCalls).toBe(1);
  expect(
    p.audit.some(
      (a: { event_type: string }) => a.event_type === 'RESOLUTION_CONFIRMED_NO_FINANCIAL_ACTION',
    ),
  ).toBe(true);
});

it('never retries an ambiguous full refund and reconciles only verified readback with current consent', async () => {
  captured = false;
  refunded = false;
  orderId = `RECONORDER${group.replaceAll('-', '').slice(0, 12)}`;
  captureId = `RECONCAP${group.replaceAll('-', '').slice(0, 12)}`;
  refundId = `RECONREF${group.replaceAll('-', '').slice(0, 12)}`;
  const created = await request(
    'a',
    'pacts',
    { ...body, title: 'Full refund reconciliation lifecycle' },
    crypto.randomUUID(),
  );
  expect(created.status).toBe(201);
  pactId = (await created.json()).data.id;
  const invites = (await (await request('b', 'me/invitations')).json()).data;
  const invite = invites.find((i: { pact_id: string }) => i.pact_id === pactId);
  await request('b', `invitations/${invite.id}/accept`, {});
  const order = (await (await request('b', `pacts/${pactId}/payment/order`, {})).json()).data;
  await jobs.payment(order.id);
  const capture = (await (await request('b', `pacts/${pactId}/payment/capture`, {})).json()).data;
  await jobs.payment(capture.id);
  const event = `RECON-CAPTURE-${group}`;
  await webhook(event, 'PAYMENT.CAPTURE.COMPLETED', {
    id: captureId,
    supplementary_data: { related_ids: { order_id: orderId } },
  });
  await processReceipt(event);
  const proposal = await request('a', `pacts/${pactId}/resolutions`, {
    type: 'FULL_REFUND',
    reason: 'Both parties agree to return the entire captured test payment.',
    expectedVersion: 0,
  });
  expect(proposal.status).toBe(201);
  const rid = (await proposal.json()).data.id;
  expect((await request('a', `pacts/${pactId}/resolutions/${rid}/execute`, {})).status).toBe(403);
  await approveBoth(rid);
  const operation = (
    await (await request('a', `pacts/${pactId}/resolutions/${rid}/execute`, {})).json()
  ).data;
  const callsBefore = refundCalls;
  ambiguousRefund = true;
  await expect(jobs.payment(operation.id)).rejects.toThrow(ProviderError);
  await jobs.payment(operation.id);
  await jobs.payment(operation.id);
  expect(refundCalls).toBe(callsBefore + 1);
  const stored = (
    await db.query('SELECT status FROM paypal_transactions WHERE id=$1', [operation.id])
  ).rows[0];
  expect(stored.status).toBe('NEEDS_RECONCILIATION');
  const tx = (await db.query('SELECT version FROM transactions WHERE pact_id=$1', [pactId]))
    .rows[0];
  const input = {
    requestId: crypto.randomUUID(),
    expectedStatus: 'NEEDS_RECONCILIATION',
    expectedTransactionVersion: tx.version,
    providerId: refundId,
    reason: 'Confirm the completed full refund from authoritative Sandbox readback.',
  };
  expect((await request('b', `operations/${operation.id}/reconcile`, input)).status).toBe(403);
  vi.stubEnv('PACT_OPERATOR_SUBJECTS', `security-${group}-a`);
  expect(
    (
      await request('a', `operations/${operation.id}/reconcile`, {
        ...input,
        providerId: 'MISMATCH',
      })
    ).status,
  ).toBe(409);
  expect((await request('a', `operations/${operation.id}/reconcile`, input)).status).toBe(201);
  expect((await request('a', `operations/${operation.id}/reconcile`, input)).status).toBe(201);
  const p = await detail();
  expect(p.transaction.refunded_minor).toBe('2550');
  expect(p.transaction.state).toBe('COMPLETED');
  expect(refundCalls).toBe(callsBefore + 1);
  expect(
    p.audit.some((a: { event_type: string }) => a.event_type === 'PAYPAL_OPERATION_RECONCILED'),
  ).toBe(true);
  ambiguousRefund = false;
});
it.each(['already-captured', 'ambiguous-capture', 'minimal-response', 'failed-readback'])(
  'reads back %s without a second financial POST',
  async (scenario) => {
    captured = false;
    refunded = false;
    orderId = `ORDER${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
    captureId = `CAP${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
    const created = await request(
      'a',
      'pacts',
      { ...body, title: `Capture safety ${scenario}` },
      crypto.randomUUID(),
    );
    pactId = (await created.json()).data.id;
    const invites = (await (await request('b', 'me/invitations')).json()).data;
    await request(
      'b',
      `invitations/${invites.find((i: { pact_id: string }) => i.pact_id === pactId).id}/accept`,
      {},
    );
    const order = (await (await request('b', `pacts/${pactId}/payment/order`, {})).json()).data;
    await jobs.payment(order.id);
    const callsBefore = captureCalls;
    const amountMismatch = vi.spyOn(paypal, 'getOrder').mockResolvedValueOnce({
      id: orderId,
      status: 'APPROVED',
      purchase_units: [
        {
          custom_id: txId,
          amount: { currency_code: 'EUR', value: '25.50' },
          payments: { captures: [] },
        },
      ],
    });
    expect((await request('b', `pacts/${pactId}/payment/capture`, {})).status).toBe(409);
    expect(captureCalls).toBe(callsBefore);
    amountMismatch.mockRestore();
    if (scenario === 'already-captured') captured = true;
    const operation = (await (await request('b', `pacts/${pactId}/payment/capture`, {})).json())
      .data;
    if (scenario === 'ambiguous-capture') {
      const uncertain = vi.spyOn(paypal, 'capture').mockImplementationOnce(async () => {
        captureCalls++;
        captured = true;
        throw new ProviderError(true);
      });
      await expect(jobs.payment(operation.id)).rejects.toThrow(ProviderError);
      uncertain.mockRestore();
    } else if (scenario === 'minimal-response' || scenario === 'failed-readback') {
      const minimal = vi.spyOn(paypal, 'capture').mockImplementationOnce(async () => {
        captureCalls++;
        captured = true;
        return { id: orderId, status: 'COMPLETED', purchase_units: [] };
      });
      if (scenario === 'failed-readback') {
        const originalReadback = paypal.getOrder;
        let reads = 0;
        const unavailable = vi.spyOn(paypal, 'getOrder').mockImplementation(async () => {
          if (++reads > 1) throw new ProviderError(false, { http: 404 });
          return originalReadback();
        });
        await expect(jobs.payment(operation.id)).rejects.toMatchObject({ uncertain: true });
        unavailable.mockRestore();
      } else await jobs.payment(operation.id);
      minimal.mockRestore();
    } else await jobs.payment(operation.id);
    await jobs.payment(operation.id);
    const duplicate = await request('b', `pacts/${pactId}/payment/capture`, {});
    expect((await duplicate.json()).data.id).toBe(operation.id);
    expect(captureCalls).toBe(callsBefore + (scenario === 'already-captured' ? 0 : 1));
    expect((await detail()).transaction.state).toBe('CREATED');
    const event = `CAPTURE-SAFETY-${crypto.randomUUID()}`;
    await webhook(event, 'PAYMENT.CAPTURE.COMPLETED', {
      id: captureId,
      supplementary_data: { related_ids: { order_id: orderId } },
    });
    await processReceipt(event);
    expect((await detail()).transaction.state).toBe('CAPTURED');
  },
);
