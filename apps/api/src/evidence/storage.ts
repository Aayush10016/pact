import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream } from 'node:fs';
export interface ObjectStorage {
  put(key: string, path: string, size: number, mime: string): Promise<void>;
  download(key: string): Promise<string>;
  read(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}
@Injectable()
export class R2Storage implements ObjectStorage {
  private client?: S3Client;
  enabled() {
    return !!(
      process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME
    );
  }
  private configured() {
    if (!this.enabled())
      throw new ServiceUnavailableException('Private evidence storage is not configured.');
    if (!/^[a-f0-9]{32}$/.test(process.env.R2_ACCOUNT_ID!)) throw new ServiceUnavailableException();
    this.client ??= new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
      maxAttempts: 2,
    });
    return this.client;
  }
  async put(key: string, path: string, size: number, mime: string) {
    await this.configured().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: createReadStream(path),
        ContentLength: size,
        ContentType: mime,
        IfNoneMatch: '*',
      }),
      { abortSignal: AbortSignal.timeout(30000) },
    );
  }
  async download(key: string) {
    return getSignedUrl(
      this.configured(),
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        ResponseContentDisposition: 'attachment; filename="pact-evidence"',
        ResponseCacheControl: 'private, no-store',
      }),
      { expiresIn: 120 },
    );
  }
  async read(key: string) {
    const output = await this.configured().send(
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }),
      { abortSignal: AbortSignal.timeout(15000) },
    );
    if (!output.Body || !output.ContentLength || output.ContentLength > 8 * 1024 * 1024)
      throw new Error('Invalid evidence object size');
    const parts: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of output.Body as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) throw new Error('Evidence limit exceeded');
      parts.push(chunk);
    }
    return Buffer.concat(parts);
  }
  async remove(key: string) {
    await this.configured().send(
      new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }),
      { abortSignal: AbortSignal.timeout(10000) },
    );
  }
}
