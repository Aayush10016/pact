import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
if (existsSync('../../.env')) process.loadEnvFile('../../.env');
import type { NextConfig } from 'next';
const config: NextConfig = {
  ...(process.env.PACT_CONTAINER_BUILD === 'true'
    ? { output: 'standalone' as const, outputFileTracingRoot: resolve(process.cwd(), '../..') }
    : {}),
  poweredByHeader: false,
  transpilePackages: ['@pact/types', '@pact/shared'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};
export default config;
