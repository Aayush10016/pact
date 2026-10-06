import 'reflect-metadata';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { IdentityVerifier } from '../src/auth/auth.module';
import { HttpErrorFilter } from '../src/common/http-error.filter';
let app: INestApplication;
let origin: string;
const group = crypto.randomUUID();
// Identity provider double exists only in this test module. Storage/authorization run against real PostgreSQL.
const subjects = ['a', 'b', 'outsider'];
beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(IdentityVerifier)
    .useValue({
      verify: async (token: string) => {
        const who = token.split('.')[0];
        if (!subjects.includes(who)) throw new Error('Test identity unavailable');
        return {
          subject: `test-${group}-${who}`,
          email: `${who}-${group}@example.test`,
          name: `Test party ${who}`,
        };
      },
    })
    .compile();
  app = module.createNestApplication();
  app.useGlobalFilters(new HttpErrorFilter());
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
}, 60000);
afterAll(async () => {
  await app?.close();
});
export const body = {
  title: 'A real persistent agreement',
  counterpartyEmail: `b-${group}@example.test`,
  agreement: 'Deliver the final identity files and guidelines with complete source assets.',
  money: { amountMinor: '2550', currency: 'USD' },
  payerRole: 'PARTY_B',
  paymentCondition: 'Both parties explicitly approve the delivered package.',
  commitments: [
    {
      title: 'Brand identity',
      description: 'Deliver the complete editable identity package.',
      acceptanceCriteria: 'Editable source and exported assets.',
      expectedEvidence: 'The final delivery file and dated receipt.',
      milestones: [{ title: 'Final assets' }],
    },
  ],
};
async function request(who: string, path: string, value?: unknown, key?: string) {
  return fetch(`${origin}/v1/${path}`, {
    method: value === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${who}.test.signature`,
      'content-type': 'application/json',
      ...(key ? { 'idempotency-key': key } : {}),
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
}
let pactId: string;
let invitationId: string;
it('persists Pacts once, with integer money, distinct parties and separate payment state', async () => {
  const key = crypto.randomUUID();
  const created = await request('a', 'pacts', body, key);
  expect(created.status).toBe(201);
  pactId = (await created.json()).data.id;
  expect((await (await request('a', 'pacts', body, key)).json()).data.id).toBe(pactId);
  expect(
    (await request('a', 'pacts', { ...body, title: 'Different request content' }, key)).status,
  ).toBe(409);
  const detail = (await (await request('a', `pacts/${pactId}`)).json()).data;
  expect(detail.transaction.amount_minor).toBe('2550');
  expect(detail.status).toBe('CREATED');
  expect(detail.transaction.state).toBe('CREATED');
  expect(detail.commitments[0].milestones).toHaveLength(1);
  expect(detail.audit.some((e: { event_type: string }) => e.event_type === 'PACT_CREATED')).toBe(
    true,
  );
});
it('denies cross-user reads and invitation acceptance by the wrong verified email', async () => {
  expect((await request('outsider', `pacts/${pactId}`)).status).toBe(404);
  const invites = (await (await request('b', 'me/invitations')).json()).data;
  invitationId = invites.find((i: { pact_id: string }) => i.pact_id === pactId).id;
  expect((await request('outsider', `invitations/${invitationId}/accept`, {})).status).toBe(403);
  expect((await request('b', `invitations/${invitationId}/accept`, {})).status).toBe(201);
  const detail = (await (await request('b', `pacts/${pactId}`)).json()).data;
  expect(detail.status).toBe('ACTIVE');
  expect(detail.parties.map((p: { role: string }) => p.role)).toEqual(['PARTY_A', 'PARTY_B']);
});
it('only the promising party can mark a milestone delivered', async () => {
  const detail = (await (await request('a', `pacts/${pactId}`)).json()).data;
  const milestone = detail.commitments[0].milestones[0].id;
  expect((await request('b', `pacts/${pactId}/milestones/${milestone}/deliver`, {})).status).toBe(
    403,
  );
  expect((await request('a', `pacts/${pactId}/milestones/${milestone}/deliver`, {})).status).toBe(
    201,
  );
  expect((await request('b', `pacts/${pactId}/commitments`, body.commitments[0])).status).toBe(409);
});
it('rejects arbitrary transitions and stale Pact versions', async () => {
  const detail = (await (await request('a', `pacts/${pactId}`)).json()).data;
  expect(
    (
      await request('a', `pacts/${pactId}/transition`, {
        status: 'COMPLETED',
        expectedVersion: detail.version,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await request('b', `pacts/${pactId}/transition`, {
        status: 'DISPUTED',
        expectedVersion: detail.version + 10,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await request('b', `pacts/${pactId}/transition`, {
        status: 'DISPUTED',
        expectedVersion: detail.version,
      })
    ).status,
  ).toBe(201);
});
