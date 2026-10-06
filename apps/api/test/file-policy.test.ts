import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { validateFile } from '../src/evidence/file-policy';
let directory: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'pact-policy-'));
});
afterAll(async () => {
  if (
    resolve(directory).startsWith(resolve(tmpdir()) + '\\') ||
    resolve(directory).startsWith(resolve(tmpdir()) + '/')
  )
    await rm(directory, { recursive: true, force: true });
});
async function file(content: Buffer, mimetype: string) {
  const path = join(directory, crypto.randomUUID());
  await writeFile(path, content);
  return { path, size: content.length, mimetype };
}
it('hashes validated UTF-8 text and rejects spoofed MIME content', async () => {
  expect(await validateFile(await file(Buffer.from('A delivery receipt.'), 'text/plain'))).toMatch(
    /^[a-f0-9]{64}$/,
  );
  await expect(
    validateFile(await file(Buffer.from('MZ executable'), 'image/png')),
  ).rejects.toThrow();
  await expect(
    validateFile(await file(Buffer.from('<script>'), 'image/svg+xml')),
  ).rejects.toThrow();
});
it('rejects oversized, empty, binary and invalid UTF-8 text', async () => {
  for (const content of [
    Buffer.alloc(0),
    Buffer.alloc(65537, 65),
    Buffer.from([0, 1, 2]),
    Buffer.from([255, 255]),
  ])
    await expect(validateFile(await file(content, 'text/plain'))).rejects.toThrow();
});
