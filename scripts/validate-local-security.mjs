import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
if (existsSync('.env')) process.loadEnvFile('.env');
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
require('reflect-metadata');
const { MinioStorageAdapter } = require('./dist/evidence/storage.js');
const { EvidenceScanner } = require('./dist/evidence/scanner.js');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const storage = new MinioStorageAdapter(),
  scanner = new EvidenceScanner();
const folder = await mkdtemp(join(tmpdir(), 'pact-storage-probe-'));
const bytes = Buffer.from('Synthetic Pact delivery receipt. No private evidence.');
const key = 'validation/' + randomUUID() + '/v1';
const path = join(folder, 'receipt.txt');
await writeFile(path, bytes);
const checks = {};
try {
  await storage.put(key, path, bytes.length, 'text/plain');
  checks.upload = true;
  const read = await storage.read(key);
  checks.checksum =
    createHash('sha256').update(read).digest('hex') ===
    createHash('sha256').update(bytes).digest('hex');
  try {
    await storage.put(key, path, bytes.length, 'text/plain');
    checks.immutable = false;
  } catch (error) {
    checks.immutable = error.$metadata?.httpStatusCode === 412;
  }
  const url = await storage.download(key);
  const signed = await fetch(url);
  checks.authorizedDownload = signed.ok && Buffer.from(await signed.arrayBuffer()).equals(bytes);
  checks.expirySeconds = new URL(url).searchParams.get('X-Amz-Expires') === '120';
  const publicURL = new URL(url);
  publicURL.search = '';
  checks.privateBucket = (await fetch(publicURL)).status === 403;
  const client = new S3Client({
    endpoint: process.env.MINIO_PUBLIC_ENDPOINT,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY_ID,
      secretAccessKey: process.env.MINIO_SECRET_ACCESS_KEY,
    },
  });
  const expired = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: process.env.MINIO_BUCKET_NAME, Key: key }),
    { expiresIn: 1, signingDate: new Date(Date.now() - 180000) },
  );
  checks.expiredDownloadRejected = (await fetch(expired)).status === 403;
  client.destroy();
  checks.cleanScan = (await scanner.scan(bytes)) === 'CLEAN';
  // Standard inert antivirus test signature, kept in memory rather than an evidence upload.
  const eicar = Buffer.from(
    ['X5O!P%@AP[4', '\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join(''),
  );
  checks.malwareDetected = (await scanner.scan(eicar)) === 'INFECTED';
  checks.oversizedRejected = await scanner.scan(new Uint8Array(8 * 1024 * 1024 + 1)).then(
    () => false,
    () => true,
  );
  console.log(JSON.stringify({ providers: 'real-local-minio-and-clamav', key, checks }));
  if (Object.values(checks).some((value) => !value)) process.exitCode = 1;
} finally {
  await rm(folder, { recursive: true, force: true });
}
