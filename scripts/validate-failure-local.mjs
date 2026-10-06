import { createRequire } from 'node:module';
process.loadEnvFile('.env');
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
require('reflect-metadata');
const { MinioStorageAdapter } = require('./dist/evidence/storage.js');
const { EvidenceScanner } = require('./dist/evidence/scanner.js');
process.env.MINIO_ENDPOINT = 'http://127.0.0.1:1';
process.env.MINIO_PUBLIC_ENDPOINT = 'http://127.0.0.1:1';
process.env.CLAMAV_HOST = '127.0.0.1';
process.env.CLAMAV_PORT = '1';
async function rejects(task) {
  try {
    await task();
    return false;
  } catch {
    return true;
  }
}
const result = {
  unavailableStorageRejected: await rejects(() =>
    new MinioStorageAdapter().read('validation/unavailable'),
  ),
  unavailableScannerRejected: await rejects(() =>
    new EvidenceScanner().scan(Buffer.from('Synthetic safe fixture')),
  ),
};
console.log(JSON.stringify(result));
if (!Object.values(result).every(Boolean)) process.exitCode = 1;
