import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { HttpErrorFilter } from '../src/common/http-error.filter';
import { DisabledPayPalAdapter } from '../src/payments/payments.module';
let app: INestApplication; let origin: string;
beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication(); app.useGlobalFilters(new HttpErrorFilter());
  await app.listen(0, '127.0.0.1'); origin = await app.getUrl();
});
afterAll(async () => { await app.close(); });
describe('foundation HTTP contracts', () => {
  it('serves live health and explicitly labeled samples', async () => {
    expect((await (await fetch(`${origin}/health`)).json()).data.status).toBe('ok');
    const response = await (await fetch(`${origin}/v1/demo/pacts`)).json();
    expect(response.meta.sample).toBe(true); expect(response.data).toHaveLength(3);
  });
  it('rejects malformed drafts and unknown sample records', async () => {
    expect((await fetch(`${origin}/v1/demo/pacts/validate-draft`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(400);
    expect((await fetch(`${origin}/v1/demo/pacts/not-a-record`)).status).toBe(404);
  });
  it('denies financial execution even with a forged bearer identity', async () => {
    expect((await fetch(`${origin}/v1/payments/execute`, { method: 'POST', headers: { authorization: 'Bearer fake-user-token' } })).status).toBe(403);
    await expect(new DisabledPayPalAdapter().executeAuthorizedAction()).rejects.toThrow('disabled');
  });
});
