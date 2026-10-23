import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
// Inspect fully merged configuration in memory; never print expanded credentials.
const config = JSON.parse(
  execFileSync(
    'docker',
    [
      'compose',
      '--env-file',
      '.env',
      '-f',
      'docker-compose.yml',
      '-f',
      'docker-compose.sandbox.yml',
      'config',
      '--format',
      'json',
    ],
    {
      env: {
        ...process.env,
        PACT_HOST: 'staging.pact.test',
        PACT_TESTER_EMAILS: 'tester@example.com',
        PACT_FILES_HOST: 'files.pact.test',
      },
      encoding: 'utf8',
    },
  ),
);
assert.equal(config.name, 'pact-sandbox');
for (const [name, service] of Object.entries(config.services)) {
  if (name !== 'gateway')
    assert.equal(service.ports?.length || 0, 0, `${name} must not publish ports`);
}
assert.deepEqual(
  config.services.gateway.ports.map((p) => Number(p.published)).sort((a, b) => a - b),
  [80, 443],
);
assert.equal(config.services.api.environment.WEB_ORIGIN, 'https://staging.pact.test');
assert.equal(config.services.api.environment.MINIO_PUBLIC_ENDPOINT, 'https://files.pact.test');
assert.equal(config.services.api.environment.PAYPAL_BASE_URL, 'https://api-m.sandbox.paypal.com');
assert(!Object.keys(config.services.ai.environment).some((key) => key.startsWith('PAYPAL_')));
assert(config.services.api.environment.DATABASE_URL.includes('pact_runtime:'));
console.log(
  'Hosted Sandbox config: isolated project, private service ports, HTTPS origins, restricted runtime identity and Sandbox-only payments PASS.',
);
