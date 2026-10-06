import { describe, expect, it } from 'vitest';
import { requireHumanApproval, transitionPayment, validateAssessment, formatMoney } from './index';
import { draftSchema, moneySchema } from '@pact/types';
describe('financial authorization boundary', () => {
  it('never authorizes an AI recommendation without humans', () => {
    expect(() => transitionPayment('AWAITING_APPROVAL', 'ACTION_AUTHORIZED')).toThrow(
      'Human authorization',
    );
    expect(() => requireHumanApproval('r1', ['buyer', 'seller'], [])).toThrow('Both parties');
  });
  it('rejects a single approval, other-resolution approvals, and duplicate parties', () => {
    expect(() =>
      requireHumanApproval(
        'r1',
        ['buyer', 'seller'],
        [{ userId: 'buyer', resolutionId: 'r1', decision: 'APPROVED' }],
      ),
    ).toThrow();
    expect(() =>
      requireHumanApproval(
        'r1',
        ['buyer', 'seller'],
        ['buyer', 'seller'].map((userId) => ({ userId, resolutionId: 'r2', decision: 'APPROVED' })),
      ),
    ).toThrow();
    expect(() => requireHumanApproval('r1', ['buyer', 'buyer'], [])).toThrow();
  });
  it('allows authorization only for distinct approving parties', () => {
    const approvals = ['buyer', 'seller'].map((userId) => ({
      userId,
      resolutionId: 'r1',
      decision: 'APPROVED' as const,
    }));
    expect(
      transitionPayment('AWAITING_APPROVAL', 'ACTION_AUTHORIZED', {
        resolutionId: 'r1',
        partyIds: ['buyer', 'seller'],
        approvals,
      }),
    ).toBe('ACTION_AUTHORIZED');
    expect(() =>
      requireHumanApproval(
        'r1',
        ['buyer', 'seller'],
        [...approvals, { userId: 'seller', resolutionId: 'r1', decision: 'REJECTED' }],
      ),
    ).toThrow();
  });
  it('rejects illegal transitions and treats terminal states as terminal', () => {
    expect(() => transitionPayment('CREATED', 'COMPLETED')).toThrow();
    expect(() => transitionPayment('COMPLETED', 'ACTION_EXECUTING')).toThrow();
    expect(transitionPayment('AUTHORIZED', 'CAPTURED')).toBe('CAPTURED');
  });
});
describe('untrusted boundaries', () => {
  const assessment = {
    status: 'UNCLEAR',
    confidence: 0.2,
    supportingEvidence: ['ev1'],
    conflictingEvidence: [],
    missingEvidence: ['Final delivery'],
    reasoningSummary: 'More evidence is needed.',
    recommendation: { type: 'REQUEST_EVIDENCE' },
  };
  it('validates provider output and rejects invented evidence references', () => {
    expect(validateAssessment(assessment, ['ev1']).status).toBe('UNCLEAR');
    expect(() => validateAssessment(assessment, [])).toThrow('unknown evidence');
    expect(() => validateAssessment({ ...assessment, confidence: 2 }, ['ev1'])).toThrow();
    expect(() => validateAssessment({ ...assessment, executePayment: true }, ['ev1'])).toThrow();
  });
  it('rejects ambiguous partial refunds and irrelevant percentages', () => {
    expect(() =>
      validateAssessment(
        { ...assessment, recommendation: { type: 'PARTIAL_REFUND', percentage: 100 } },
        ['ev1'],
      ),
    ).toThrow();
    expect(() =>
      validateAssessment({ ...assessment, recommendation: { type: 'NO_ACTION', percentage: 30 } }, [
        'ev1',
      ]),
    ).toThrow();
  });
  it('uses positive integer minor units and validates drafts', () => {
    for (const amountMinor of ['-1', '0', '1.5', 'NaN'])
      expect(moneySchema.safeParse({ amountMinor, currency: 'USD' }).success).toBe(false);
    expect(formatMoney({ amountMinor: '240000', currency: 'USD' })).toBe('$2,400.00');
    expect(draftSchema.safeParse({ title: 'Test' }).success).toBe(false);
  });
});
