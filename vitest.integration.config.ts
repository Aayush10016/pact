import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts', 'apps/api/test/*.integration.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
