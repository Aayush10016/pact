import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { readConfig } from '../config';
@Controller()
export class HealthController {
  @Get('health') health() { return { data: { service: 'pact-api', status: 'ok', phase: 1 } }; }
  @Get('ready') async ready() {
    const config = readConfig();
    if (!config.DATABASE_URL || !config.REDIS_URL) throw new ServiceUnavailableException();
    const pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 2000, query_timeout: 2000 });
    const redis = new Redis(config.REDIS_URL, { lazyConnect: true, connectTimeout: 2000, maxRetriesPerRequest: 0, retryStrategy: () => null });
    redis.on('error', () => undefined);
    try {
      await pool.query('SELECT 1');
      await redis.connect();
      if (await redis.ping() !== 'PONG') throw new Error('Redis unavailable');
      return { data: { status: 'ready', dependencies: { postgres: 'ok', redis: 'ok' } } };
    } catch { throw new ServiceUnavailableException(); }
    finally { redis.disconnect(); await pool.end(); }
  }
}
@Module({ controllers: [HealthController] })
export class HealthModule {}
