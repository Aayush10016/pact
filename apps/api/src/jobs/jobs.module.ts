import {
  Module,
  Injectable,
  Inject,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Queue, Worker, UnrecoverableError } from 'bullmq';
import { Database } from '../database/database.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { PaymentsModule } from '../payments/payments.module';
import { LifecycleJobs } from './lifecycle-jobs';
const kinds = ['EVIDENCE', 'ASSESSMENT', 'PAYMENT', 'WEBHOOK'];
@Injectable()
export class JobRuntime implements OnModuleInit, OnModuleDestroy {
  private queues = new Map<string, Queue>();
  private workers: Worker[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private publishing = false;
  private readonly logger = new Logger('PactJobs');
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(LifecycleJobs) readonly runner: LifecycleJobs,
  ) {}
  async onModuleInit() {
    if (process.env.WORKERS_ENABLED !== 'true' || !process.env.REDIS_URL) return;
    await this.db.ensureRuntimeRole();
    const u = new URL(process.env.REDIS_URL);
    const connection = {
      host: u.hostname,
      port: Number(u.port || 6379),
      username: u.username || undefined,
      password: u.password || undefined,
      ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
    };
    for (const kind of kinds) {
      const name = `pact-${kind.toLowerCase()}`;
      const queue = new Queue(name, { connection });
      this.queues.set(kind, queue);
      const worker = new Worker(
        name,
        async (job) => {
          await this.runner.process(kind, job.data.resourceId);
        },
        {
          connection,
          concurrency: 1,
          ...(kind === 'ASSESSMENT' ? { limiter: { max: 4, duration: 60000 } } : {}),
        },
      );
      worker.on('failed', (job) => {
        if (job && job.attemptsMade >= (job.opts.attempts ?? 3))
          void this.runner
            .failed(kind, job.data.resourceId)
            .catch(() => this.logger.error('Failed to record job failure'));
      });
      worker.on('error', () => this.logger.error('Job transport unavailable'));
      this.workers.push(worker);
    }
    this.timer = setInterval(() => void this.publish(), 1000);
    this.timer.unref();
  }
  async publish() {
    if (this.publishing) return;
    this.publishing = true;
    try {
      await this.db.transaction(async (db) => {
        const jobs = await db.query(
          'SELECT * FROM outbox_jobs WHERE published_at IS NULL ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED',
        );
        for (const job of jobs.rows) {
          const queue = this.queues.get(job.kind);
          if (!queue) throw new UnrecoverableError('Unknown outbox kind');
          await queue.add(
            job.kind,
            { resourceId: job.resource_id },
            {
              jobId: job.id,
              attempts: 3,
              backoff: { type: 'exponential', delay: 3000 },
              removeOnComplete: { age: 86400 },
              removeOnFail: { age: 7 * 86400 },
            },
          );
          await db.query('UPDATE outbox_jobs SET published_at=now() WHERE id=$1', [job.id]);
        }
      });
    } catch {
      this.logger.error('Outbox publication unavailable');
    } finally {
      this.publishing = false;
    }
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
@Module({
  imports: [EvidenceModule, PaymentsModule],
  providers: [LifecycleJobs, JobRuntime],
  exports: [LifecycleJobs],
})
export class JobsModule {}
