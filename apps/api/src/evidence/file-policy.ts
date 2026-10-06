import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
export const mimeTypes = [
  'text/plain',
  'image/png',
  'image/jpeg',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
export async function validateFile(file: { path: string; size: number; mimetype: string }) {
  if (file.size < 1 || file.size > 8 * 1024 * 1024 || !mimeTypes.includes(file.mimetype))
    throw new BadRequestException('Use text, PNG, JPEG, PDF, or DOCX evidence up to 8 MiB.');
  const handle = await open(file.path, 'r');
  const header = Buffer.alloc(512);
  let count = 0;
  try {
    count = (await handle.read(header, 0, 512, 0)).bytesRead;
  } finally {
    await handle.close();
  }
  const valid =
    file.mimetype === 'text/plain'
      ? file.size <= 65536 && !header.subarray(0, count).includes(0)
      : file.mimetype === 'image/png'
        ? header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : file.mimetype === 'image/jpeg'
          ? header[0] === 255 && header[1] === 216 && header[2] === 255
          : file.mimetype === 'application/pdf'
            ? header.subarray(0, 5).toString() === '%PDF-'
            : header.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]));
  if (!valid) throw new BadRequestException('File content does not match the declared format.');
  if (file.mimetype === 'text/plain') {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(await readFile(file.path));
    } catch {
      throw new BadRequestException('Text evidence must use UTF-8.');
    }
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file.path)) hash.update(chunk);
  return hash.digest('hex');
}
