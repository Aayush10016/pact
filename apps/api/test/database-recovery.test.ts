import { expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { Database } from '../src/database/database.module';
it('handles idle connection loss without leaking connection details or crashing', async () => {
  const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  const db = new Database();
  try {
    expect(() =>
      db.pool.emit('error', new Error('synthetic private connection details')),
    ).not.toThrow();
    expect(log).toHaveBeenCalledWith(
      'Database idle connection interrupted; reconnecting on next request.',
    );
  } finally {
    await db.onModuleDestroy();
    log.mockRestore();
  }
});
