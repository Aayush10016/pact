import {
  Injectable,
  ServiceUnavailableException,
  HttpException,
  type OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
@Injectable()
export class RequestLimiter implements OnModuleDestroy {
  private client?: Redis;
  async consume(subject: string, upload: boolean) {
    if (!process.env.REDIS_URL)
      throw new ServiceUnavailableException('Request protection is unavailable.');
    if (!this.client) {
      this.client = new Redis(process.env.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 0,
        connectTimeout: 3000,
        retryStrategy: () => null,
      });
      this.client.on('error', () => undefined);
    }
    const minute = Math.floor(Date.now() / 60000);
    for (const [kind, limit] of [['requests', 120], ...(upload ? [['uploads', 20]] : [])] as Array<
      [string, number]
    >) {
      let count: number;
      try {
        count = Number(
          await this.client.eval(
            "local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],70) end;return n",
            1,
            `pact-rate-${subject}-${minute}-${kind}`,
          ),
        );
      } catch {
        throw new ServiceUnavailableException('Request protection is unavailable.');
      }
      if (count > limit) throw new HttpException('Request budget reached. Try again shortly.', 429);
    }
  }
  async onModuleDestroy() {
    this.client?.disconnect();
  }
}
