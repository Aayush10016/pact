import { z } from 'zod';
const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  DATABASE_URL: z.string().startsWith('postgresql://').optional(),
  REDIS_URL: z
    .url()
    .refine((value) => ['redis:', 'rediss:'].includes(new URL(value).protocol), {
      message: 'Use a Redis or TLS Redis URL',
    })
    .optional(),
});
export const readConfig = () =>
  configSchema.parse({ ...process.env, API_PORT: process.env.API_PORT ?? process.env.PORT });
