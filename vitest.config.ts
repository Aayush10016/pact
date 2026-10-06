import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/api/test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/integration/**', '**/*.integration.test.ts'],
    environment: 'node',
    hookTimeout: 60000,
    testTimeout: 15000,
    maxWorkers: 2,
  },
});
