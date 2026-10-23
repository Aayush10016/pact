import { expect, it } from 'vitest';
import { apiTarget } from '../lib/api-target';

it('sends only bounded evidence routes to the configured HTTPS backend', () => {
  const origin = 'https://pact-sandbox-api.onrender.com';
  expect(apiTarget('pacts/pact-id/evidence', true, origin)).toBe(
    `${origin}/v1/pacts/pact-id/evidence`,
  );
  expect(apiTarget('pacts/pact-id/evidence/evidence-id/versions', true, origin)).toBe(
    `${origin}/v1/pacts/pact-id/evidence/evidence-id/versions`,
  );
  for (const path of [
    'pacts/pact-id/payment/capture',
    'staff/cases',
    'pacts/pact-id/evidence/../payment',
    '//other.test',
  ])
    expect(apiTarget(path, true, origin)).toBe(`/api/pact/${path}`);
  expect(apiTarget('pacts/pact-id/evidence', false, origin)).toBe(
    '/api/pact/pacts/pact-id/evidence',
  );
  expect(apiTarget('pacts/pact-id/evidence', true)).toBe('/api/pact/pacts/pact-id/evidence');
});

it('rejects unsafe upload origins before any token or file can be transmitted', () => {
  for (const origin of [
    'http://pact.test',
    'https://user:secret@pact.test',
    'https://pact.test/path',
    'https://pact.test/?key=private',
    'https://pact.test/#fragment',
    'invalid',
  ])
    expect(() => apiTarget('pacts/pact-id/evidence', true, origin)).toThrow();
});
