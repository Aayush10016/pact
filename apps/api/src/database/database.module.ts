import { requestContext } from '../common/request-context';
import {
  Global,
  Injectable,
  Module,
  NotFoundException,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
@Injectable()
export class Database implements OnModuleDestroy {
  private runtimeChecked = false;
  readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 3000,
    max: 10,
  });
  async ensureRuntimeRole() {
    if (this.runtimeChecked) return;
    const role = await this.query(
      'SELECT rolname,rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user',
    );
    const r = role.rows[0];
    if (!r || r.rolname !== 'pact_runtime' || r.rolsuper || r.rolcreatedb || r.rolcreaterole)
      throw new ServiceUnavailableException(
        'Private workflows require a restricted database identity.',
      );
    this.runtimeChecked = true;
  }
  async query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) {
    return this.pool.query<T>(sql, values);
  }
  async transaction<T>(fn: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const result = await fn(db);
      await db.query('COMMIT');
      return result;
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    } finally {
      db.release();
    }
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
}
export async function member(db: PoolClient, pactId: string, userId: string, lock = false) {
  const result = await db.query(
    `SELECT p.*,r.role FROM pacts p JOIN parties r ON r.pact_id=p.id WHERE p.id=$1 AND r.user_id=$2 ${lock ? 'FOR UPDATE OF p' : ''}`,
    [pactId, userId],
  );
  if (!result.rowCount) throw new NotFoundException('Pact not found.');
  return result.rows[0];
}
export async function audit(
  db: PoolClient,
  pactId: string,
  actorId: string | null,
  event: string,
  metadata: Record<string, unknown> = {},
) {
  await db.query(
    'INSERT INTO audit_events(pact_id,actor_id,event_type,metadata) VALUES($1,$2,$3,$4)',
    [
      pactId,
      actorId,
      event,
      JSON.stringify({
        ...metadata,
        ...(requestContext.getStore() ? { requestId: requestContext.getStore()!.requestId } : {}),
      }),
    ],
  );
}
export async function enqueue(db: PoolClient, kind: string, resourceId: string, key: string) {
  await db.query(
    'INSERT INTO outbox_jobs(kind,resource_id,dedupe_key) VALUES($1,$2,$3) ON CONFLICT(dedupe_key) DO NOTHING',
    [kind, resourceId, key],
  );
}
@Global()
@Module({ providers: [Database], exports: [Database] })
export class DatabaseModule {}
