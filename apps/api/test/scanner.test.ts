import { createServer } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { EvidenceScanner } from '../src/evidence/scanner';
afterEach(() => vi.unstubAllEnvs());
async function scan(response: string) {
  const server = createServer((socket) => {
    socket.once('data', () => socket.end(response));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('No test port');
  vi.stubEnv('CLAMAV_HOST', '127.0.0.1');
  vi.stubEnv('CLAMAV_PORT', String(address.port));
  try {
    return await new EvidenceScanner().scan(Buffer.from('bounded test bytes'));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
it('accepts only the explicit clean INSTREAM verdict', async () => {
  expect(await scan('stream: OK\0')).toBe('CLEAN');
});
it('quarantines a detected infection', async () => {
  expect(await scan('stream: Eicar-Test-Signature FOUND\0')).toBe('INFECTED');
});
it('fails closed for scanner errors and malformed output', async () => {
  await expect(scan('stream: scan failure ERROR\0')).rejects.toThrow('SCANNER_UNAVAILABLE');
  await expect(scan('not a verdict\0')).rejects.toThrow('SCANNER_UNAVAILABLE');
});
