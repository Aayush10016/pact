import { afterAll, beforeAll, expect, it } from 'vitest';
import { Client } from 'pg';
import Redis from 'ioredis';
import { Queue, Worker, QueueEvents } from 'bullmq';
let db: Client;
let redis: Redis;
beforeAll(async () => {
  if (!process.env.DATABASE_URL || !process.env.REDIS_URL)
    throw new Error('Integration tests require DATABASE_URL and REDIS_URL.');
  db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
});
afterAll(async () => {
  await db?.end();
  redis?.disconnect();
});
it('PostgreSQL persists webhook identities once and protects the audit trail', async () => {
  await db.query('BEGIN');
  try {
    const event = `test-${crypto.randomUUID()}`;
    const sql =
      "INSERT INTO paypal_webhook_events(provider_event_id,event_type,verification_status,payload) VALUES($1,'TEST','VERIFIED','{}') ON CONFLICT(provider_event_id) DO NOTHING RETURNING id";
    expect((await db.query(sql, [event])).rowCount).toBe(1);
    expect((await db.query(sql, [event])).rowCount).toBe(0);
    const audit = await db.query(
      "INSERT INTO audit_events(event_type) VALUES('TEST') RETURNING id",
    );
    await expect(
      db.query('DELETE FROM audit_events WHERE id=$1', [audit.rows[0].id]),
    ).rejects.toThrow(/append-only|permission denied/);
  } finally {
    await db.query('ROLLBACK');
  }
});
it('Redis and BullMQ process an idempotently named job', async () => {
  expect(await redis.ping()).toBe('PONG');
  const name = `pact-integration-${crypto.randomUUID()}`;
  const connection = {
    host: new URL(process.env.REDIS_URL!).hostname,
    port: Number(new URL(process.env.REDIS_URL!).port || 6379),
  };
  const queue = new Queue(name, { connection });
  const events = new QueueEvents(name, { connection });
  const worker = new Worker(name, async (job) => ({ processed: job.data.evidenceVersionId }), {
    connection,
  });
  try {
    await events.waitUntilReady();
    const job = await queue.add('evidence', { evidenceVersionId: 'ev1' }, { jobId: 'ev1' });
    expect(await job.waitUntilFinished(events, 10000)).toEqual({ processed: 'ev1' });
    await queue.add('evidence', { evidenceVersionId: 'ev1' }, { jobId: 'ev1' });
    expect(await queue.getJobCounts()).toMatchObject({ completed: 1 });
  } finally {
    await worker.close();
    await queue.obliterate({ force: true });
    await events.close();
    await queue.close();
  }
});
