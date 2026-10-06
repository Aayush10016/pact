import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  GetBucketPolicyCommand,
  PutBucketVersioningCommand,
} = require('@aws-sdk/client-s3');
if (existsSync('.env')) process.loadEnvFile('.env');
const bucket = process.env.MINIO_BUCKET_NAME || 'pact-evidence';
const client = new S3Client({
  region: 'us-east-1',
  endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY_ID || 'pact_local_minio',
    secretAccessKey: process.env.MINIO_SECRET_ACCESS_KEY || 'pact_minio_local_only_change_me',
  },
});
try {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error) {
    if (error.$metadata?.httpStatusCode !== 404) throw error;
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
  try {
    await client.send(new GetBucketPolicyCommand({ Bucket: bucket }));
    throw new Error('Unexpected bucket policy: inspect before use.');
  } catch (error) {
    if (!['NoSuchBucketPolicy', 'NoSuchBucketPolicyException'].includes(error.name)) throw error;
  }
  await client.send(
    new PutBucketVersioningCommand({
      Bucket: bucket,
      VersioningConfiguration: { Status: 'Enabled' },
    }),
  );
  console.log('Private versioned MinIO bucket ready. Local credentials only; no public policy.');
} finally {
  client.destroy();
}
