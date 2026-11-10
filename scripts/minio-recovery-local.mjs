import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
process.loadEnvFile('.env');
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const directory = resolve(process.argv[2] || '.recovery-local');
mkdirSync(directory, { recursive: true });
const runId = randomUUID();
const name = 'pact-minio-recovery-' + Date.now();
const volume = name + '-data';
const archive = 'minio-' + Date.now() + '.tar.gz';
const log = readFileSync('.storage-scan-validation.log', 'utf8')
  .split(/\r?\n/)
  .find((line) => line.startsWith('{"providers"'));
if (!log) throw new Error('Run real local security validation before the recovery drill.');
const key = JSON.parse(log).key;
function docker(args, env = process.env) {
  const result = spawnSync('docker', ['--context', 'desktop-linux', ...args], {
    encoding: 'utf8',
    timeout: 120000,
    env,
  });
  if (result.status !== 0) throw new Error('MinIO recovery step failed: ' + args[0]);
  return result.stdout.trim();
}
async function object(endpoint) {
  const client = new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY_ID,
      secretAccessKey: process.env.MINIO_SECRET_ACCESS_KEY,
    },
  });
  try {
    const result = await client.send(
      new GetObjectCommand({ Bucket: process.env.MINIO_BUCKET_NAME, Key: key }),
    );
    return createHash('sha256')
      .update(await result.Body.transformToByteArray())
      .digest('hex');
  } finally {
    client.destroy();
  }
}
const before = await object(process.env.MINIO_ENDPOINT);
let stopped = false,
  created = false;
try {
  docker(['compose', 'stop', 'minio']);
  stopped = true;
  docker([
    'run',
    '--rm',
    '--user',
    '0',
    '--entrypoint',
    'tar',
    '--mount',
    'type=volume,source=pact_minio_data,target=/source,readonly',
    '--mount',
    'type=bind,source=' + directory + ',target=/backup',
    'pact-minio',
    '-C',
    '/source',
    '-czf',
    '/backup/' + archive,
    '.',
  ]);
  docker(['compose', 'start', 'minio']);
  stopped = false;
  docker(['volume', 'create', volume]);
  docker([
    'run',
    '--rm',
    '--user',
    '0',
    '--entrypoint',
    'tar',
    '--mount',
    'type=volume,source=' + volume + ',target=/restore',
    '--mount',
    'type=bind,source=' + directory + ',target=/backup,readonly',
    'pact-minio',
    '-C',
    '/restore',
    '-xzf',
    '/backup/' + archive,
  ]);
  const env = {
    ...process.env,
    MINIO_ROOT_USER: process.env.MINIO_ACCESS_KEY_ID,
    MINIO_ROOT_PASSWORD: process.env.MINIO_SECRET_ACCESS_KEY,
  };
  docker(
    [
      'run',
      '-d',
      '--name',
      name,
      '--label',
      'pact.recovery=' + runId,
      '--env',
      'MINIO_ROOT_USER',
      '--env',
      'MINIO_ROOT_PASSWORD',
      '--env',
      'MINIO_BROWSER=off',
      '--publish',
      '127.0.0.1:19000:9000',
      '--mount',
      'type=volume,source=' + volume + ',target=/data',
      'pact-minio',
    ],
    env,
  );
  created = true;
  async function ready(endpoint) {
    for (let n = 0; n < 30; n++) {
      try {
        if (
          (await fetch(endpoint + '/minio/health/live', { signal: AbortSignal.timeout(1000) })).ok
        )
          return;
      } catch {
        // Storage can take a few seconds to reopen its persisted volume.
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error('Recovery storage did not become ready.');
  }
  await ready(process.env.MINIO_ENDPOINT);
  await ready('http://localhost:19000');
  const report = {
    kind: 'real-minio-volume-backup-restore',
    originalRestartIntegrity: before === (await object(process.env.MINIO_ENDPOINT)),
    restoredObjectIntegrity: before === (await object('http://localhost:19000')),
    archiveSha256: createHash('sha256')
      .update(readFileSync(join(directory, archive)))
      .digest('hex'),
    recoveryVolume: volume,
  };
  writeFileSync(join(directory, 'minio-recovery-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (!report.originalRestartIntegrity || !report.restoredObjectIntegrity) process.exitCode = 1;
} finally {
  if (stopped) docker(['compose', 'start', 'minio']);
  if (
    created &&
    docker(['inspect', '--format', '{{index .Config.Labels "pact.recovery"}}', name]) === runId
  ) {
    docker(['stop', name]);
    docker(['rm', name]);
  }
}
