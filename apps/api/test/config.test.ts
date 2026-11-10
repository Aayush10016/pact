import { afterEach, expect, it, vi } from 'vitest';
import { readConfig } from '../src/config';

afterEach(() => vi.unstubAllEnvs());

it('accepts TLS Redis for hosted queues without changing the URL', () => {
  const redis = 'rediss://queue-user:synthetic-test-value@redis.example.test:6379/0';
  vi.stubEnv('REDIS_URL', redis);
  expect(readConfig().REDIS_URL).toBe(redis);
  vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:6379');
  expect(readConfig().REDIS_URL).toBe('redis://127.0.0.1:6379');
  vi.stubEnv('REDIS_URL', 'https://redis.example.test');
  expect(() => readConfig()).toThrow();
});

it('uses the platform port only when no explicit API port is set', () => {
  vi.stubEnv('REDIS_URL', undefined);
  vi.stubEnv('API_PORT', undefined);
  vi.stubEnv('PORT', '10000');
  expect(readConfig().API_PORT).toBe(10000);
  vi.stubEnv('API_PORT', '4000');
  expect(readConfig().API_PORT).toBe(4000);
  vi.stubEnv('API_PORT', undefined);
  vi.stubEnv('PORT', 'not-a-port');
  expect(() => readConfig()).toThrow();
  vi.stubEnv('PORT', undefined);
  expect(readConfig().API_PORT).toBe(4000);
});
