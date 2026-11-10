import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream } from 'node:fs';
export abstract class EvidenceStorage {
  abstract enabled(): boolean;
  abstract put(key: string, path: string, size: number, mime: string): Promise<void>;
  abstract download(key: string): Promise<string>;
  abstract read(key: string): Promise<Uint8Array>;
  abstract remove(key: string): Promise<void>;
}
@Injectable()
export class R2Storage extends EvidenceStorage {
  protected client?: S3Client;
  protected bucket() {
    return process.env.R2_BUCKET_NAME;
  }
  enabled() {
    return !!(
      process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME
    );
  }
  protected configured(publicEndpoint = false): S3Client {
    void publicEndpoint;
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
    if (!Number.isInteger(size) || size < 1 || size > 8 * 1024 * 1024)
      throw new Error('Invalid evidence object size');
    await this.configured().send(
      new PutObjectCommand({
        Bucket: this.bucket(),
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
      this.configured(true),
      new GetObjectCommand({
        Bucket: this.bucket(),
        Key: key,
        ResponseContentDisposition: 'attachment; filename="pact-evidence"',
        ResponseCacheControl: 'private, no-store',
      }),
      { expiresIn: 120 },
    );
  }
  async read(key: string) {
    const output = await this.configured().send(
      new GetObjectCommand({ Bucket: this.bucket(), Key: key }),
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
    await this.configured().send(new DeleteObjectCommand({ Bucket: this.bucket(), Key: key }), {
      abortSignal: AbortSignal.timeout(10000),
    });
  }
}

@Injectable()
export class MinioStorageAdapter extends R2Storage {
  private publicClient?: S3Client;
  protected override bucket() {
    return process.env.MINIO_BUCKET_NAME;
  }
  override enabled() {
    return !!(
      process.env.MINIO_ENDPOINT &&
      process.env.MINIO_PUBLIC_ENDPOINT &&
      process.env.MINIO_ACCESS_KEY_ID &&
      process.env.MINIO_SECRET_ACCESS_KEY &&
      process.env.MINIO_BUCKET_NAME
    );
  }
  protected override configured(publicEndpoint = false): S3Client {
    if (!this.enabled())
      throw new ServiceUnavailableException('Private evidence storage is not configured.');
    const endpoint = new URL(
      (publicEndpoint ? process.env.MINIO_PUBLIC_ENDPOINT : process.env.MINIO_ENDPOINT)!,
    );
    if (
      endpoint.username ||
      endpoint.password ||
      endpoint.pathname !== '/' ||
      endpoint.search ||
      endpoint.hash ||
      !['http:', 'https:'].includes(endpoint.protocol) ||
      (endpoint.protocol === 'http:' &&
        !['localhost', '127.0.0.1', 'minio'].includes(endpoint.hostname))
    )
      throw new ServiceUnavailableException('Invalid private storage endpoint.');
    const client = publicEndpoint ? this.publicClient : this.client;
    if (client) return client;
    const created = new S3Client({
      endpoint: endpoint.href,
      region: 'us-east-1',
      forcePathStyle: true,
      maxAttempts: 2,
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY_ID!,
        secretAccessKey: process.env.MINIO_SECRET_ACCESS_KEY!,
      },
    });
    if (publicEndpoint) this.publicClient = created;
    else this.client = created;
    return created;
  }
}
