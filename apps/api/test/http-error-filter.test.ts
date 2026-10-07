import { expect, it, vi } from 'vitest';
import { Logger, type ArgumentsHost } from '@nestjs/common';
import { HttpErrorFilter } from '../src/common/http-error.filter';
import { ProviderError } from '../src/payments/paypal.provider';
it('returns safe UTF-8 provider errors without stack traces or raw provider bodies', () => {
  const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  const response = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as ArgumentsHost;
  try {
    new HttpErrorFilter().catch(
      new ProviderError(false, {
        http: 404,
        name: 'RESOURCE_NOT_FOUND',
        issue: 'INVALID_RESOURCE_ID',
      }),
      host,
    );
    expect(response.statusCode).toBe(503);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/json; charset=utf-8',
    );
    const json = JSON.parse(response.end.mock.calls[0]![0]);
    expect(json.error.message).toContain('stored order');
    expect(json.error).not.toHaveProperty('stack');
    expect(warn).toHaveBeenCalledOnce();
  } finally {
    warn.mockRestore();
  }
});
