export interface RetentionFacts {
  createdAt: Date;
  pactStatus: string;
  paymentState: string;
  legalHold: boolean;
  unresolvedFinancialAttempts: number;
  pendingWebhooks: number;
  unretiredResolution: boolean;
}
// Conservative review policy. No automatic object deletion or audit/financial pruning.
export function retentionDecision(facts: RetentionFacts, now = new Date()) {
  if (facts.legalHold) return { eligible: false, reason: 'LEGAL_HOLD' };
  if (!['COMPLETED', 'RESOLVED', 'CANCELLED'].includes(facts.pactStatus))
    return { eligible: false, reason: 'ACTIVE_OR_DISPUTED' };
  if (
    !['COMPLETED', 'CANCELLED'].includes(facts.paymentState) ||
    facts.unresolvedFinancialAttempts ||
    facts.pendingWebhooks ||
    facts.unretiredResolution
  )
    return { eligible: false, reason: 'FINANCIAL_OR_RESOLUTION_HOLD' };
  if (
    !Number.isFinite(facts.createdAt.getTime()) ||
    now.getTime() - facts.createdAt.getTime() < 365 * 86400000
  )
    return { eligible: false, reason: 'MINIMUM_RETENTION' };
  return { eligible: true, reason: 'OPERATOR_REVIEW_REQUIRED' };
}
