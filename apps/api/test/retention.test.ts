import { expect, it } from 'vitest';
import { retentionDecision, type RetentionFacts } from '../src/evidence/retention';
const base: RetentionFacts = {
  createdAt: new Date('2020-01-01'),
  pactStatus: 'COMPLETED',
  paymentState: 'COMPLETED',
  legalHold: false,
  unresolvedFinancialAttempts: 0,
  pendingWebhooks: 0,
  unretiredResolution: false,
};
it('holds evidence for active agreements, disputes and explicit legal holds', () => {
  for (const pactStatus of ['ACTIVE', 'DISPUTED', 'CREATED', 'UNKNOWN'])
    expect(retentionDecision({ ...base, pactStatus }).eligible).toBe(false);
  expect(retentionDecision({ ...base, legalHold: true }).reason).toBe('LEGAL_HOLD');
});
it('holds unsettled money, unresolved attempts, webhook outcomes and proposals', () => {
  for (const change of [
    { paymentState: 'CAPTURED' },
    { unresolvedFinancialAttempts: 1 },
    { pendingWebhooks: 1 },
    { unretiredResolution: true },
  ])
    expect(retentionDecision({ ...base, ...change }).eligible).toBe(false);
});
it('requires minimum retention and operator review without deleting records', () => {
  expect(retentionDecision({ ...base, createdAt: new Date() }).eligible).toBe(false);
  expect(retentionDecision(base).reason).toBe('OPERATOR_REVIEW_REQUIRED');
});
