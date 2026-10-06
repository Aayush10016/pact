import { assessmentSchema, type Assessment, type DemoPact } from '@pact/types';

export const paymentStates = ['CREATED', 'AUTHORIZED', 'CAPTURED', 'DISPUTED', 'RESOLUTION_PROPOSED', 'AWAITING_APPROVAL', 'ACTION_AUTHORIZED', 'ACTION_EXECUTING', 'COMPLETED', 'FAILED'] as const;
export type PaymentState = typeof paymentStates[number];
const transitions: Record<PaymentState, readonly PaymentState[]> = {
  CREATED: ['AUTHORIZED', 'FAILED'], AUTHORIZED: ['CAPTURED', 'FAILED'],
  CAPTURED: ['DISPUTED', 'COMPLETED'], DISPUTED: ['RESOLUTION_PROPOSED'],
  RESOLUTION_PROPOSED: ['AWAITING_APPROVAL'], AWAITING_APPROVAL: ['ACTION_AUTHORIZED'],
  ACTION_AUTHORIZED: ['ACTION_EXECUTING'], ACTION_EXECUTING: ['COMPLETED', 'FAILED'],
  COMPLETED: [], FAILED: [],
};
export interface Approval { userId: string; resolutionId: string; decision: 'APPROVED' | 'REJECTED'; }
export function requireHumanApproval(resolutionId: string, partyIds: readonly string[], approvals: readonly Approval[]): void {
  if (new Set(partyIds).size !== 2 || !resolutionId) throw new Error('Exactly two distinct parties and a resolution are required.');
  if (!partyIds.every(id => approvals.some(a => a.userId === id && a.resolutionId === resolutionId && a.decision === 'APPROVED')))
    throw new Error('Both parties must explicitly approve this resolution.');
  if (approvals.some(a => a.resolutionId === resolutionId && a.decision === 'REJECTED')) throw new Error('A rejected resolution cannot execute.');
}
export function transitionPayment(from: PaymentState, to: PaymentState, authorization?: { resolutionId: string; partyIds: readonly string[]; approvals: readonly Approval[] }): PaymentState {
  if (!transitions[from].includes(to)) throw new Error(`Invalid payment transition: ${from} → ${to}`);
  if (to === 'ACTION_AUTHORIZED') {
    if (!authorization) throw new Error('Human authorization is required.');
    requireHumanApproval(authorization.resolutionId, authorization.partyIds, authorization.approvals);
  }
  return to;
}
export function validateAssessment(value: unknown, knownEvidence: readonly string[]): Assessment {
  const assessment = assessmentSchema.parse(value);
  for (const id of [...assessment.supportingEvidence, ...assessment.conflictingEvidence])
    if (!knownEvidence.includes(id)) throw new Error('Assessment cites unknown evidence.');
  return assessment;
}
export function formatMoney(money: { amountMinor: string; currency: string }): string {
  // These supported currencies use two minor-unit decimal places. No floating-point financial mutation.
  const integer = BigInt(money.amountMinor);
  if (integer > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount exceeds display range.');
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: money.currency }).format(Number(integer) / 100);
}
export const demoPacts: readonly DemoPact[] = [
  { id: 'brand-identity', title: 'A new identity for Fieldwork', category: 'Brand & design', otherParty: 'Maya Chen', initials: 'MC', money: { amountMinor: '240000', currency: 'USD' }, status: 'IN_REVIEW', due: '2026-10-09', completedMilestones: 2, totalMilestones: 3, nextAction: 'Review the identity delivery' },
  { id: 'studio-website', title: 'Studio website, thoughtfully built', category: 'Development', otherParty: 'Oliver Reed', initials: 'OR', money: { amountMinor: '380000', currency: 'USD' }, status: 'ACTIVE', due: '2026-10-14', completedMilestones: 1, totalMilestones: 4, nextAction: 'Homepage development in progress' },
  { id: 'product-photography', title: 'Autumn collection photography', category: 'Photography', otherParty: 'Elena Park', initials: 'EP', money: { amountMinor: '120000', currency: 'USD' }, status: 'DISPUTED', due: '2026-10-05', completedMilestones: 1, totalMilestones: 2, nextAction: 'Additional evidence requested' },
];
export const statusLabels = { ACTIVE: 'In progress', IN_REVIEW: 'Ready for review', DISPUTED: 'Needs resolution', COMPLETED: 'Completed' } as const;
