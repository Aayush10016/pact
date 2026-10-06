// Queue names form the Phase 2 contract. Workers must re-check persisted authorization.
export const queueNames = {
  evidence: 'pact-evidence',
  assessment: 'pact-assessment',
  webhook: 'pact-webhook',
} as const;
export interface EvidenceJob {
  pactId: string;
  evidenceVersionId: string;
}
export interface AssessmentJob {
  pactId: string;
  evidenceVersionIds: string[];
}
export interface VerifiedWebhookJob {
  persistedWebhookEventId: string;
}
// No financial-execution queue accepts AI output as authorization.
