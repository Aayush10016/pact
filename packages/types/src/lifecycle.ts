import { z } from 'zod';
import { moneySchema, assessmentSchema } from './index';
export const idSchema = z.uuid();
export const lifecycleStatusSchema = z.enum([
  'CREATED',
  'ACTIVE',
  'COMPLETED',
  'DISPUTED',
  'RESOLVED',
  'CANCELLED',
]);
export const commitmentInputSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(10).max(4000),
    acceptanceCriteria: z.string().trim().min(3).max(2000),
    expectedEvidence: z.string().trim().min(3).max(1000),
    dueAt: z.iso.datetime().nullable().optional(),
    milestones: z
      .array(
        z
          .object({
            title: z.string().trim().min(3).max(120),
            dueAt: z.iso.datetime().nullable().optional(),
          })
          .strict(),
      )
      .max(20)
      .default([]),
  })
  .strict();
export const createPactSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    counterpartyEmail: z.email().transform((s) => s.toLowerCase()),
    agreement: z.string().trim().min(20).max(4000),
    money: moneySchema,
    deadline: z.iso.datetime().nullable().optional(),
    paymentCondition: z.string().trim().min(10).max(1000),
    payerRole: z.enum(['PARTY_A', 'PARTY_B']),
    commitments: z.array(commitmentInputSchema).min(1).max(20),
  })
  .strict();
export const evidenceInputSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    commitmentId: idSchema,
    occurredAt: z.iso.datetime(),
    requestId: idSchema,
  })
  .strict();
export const proposalSchema = z
  .object({
    type: z.enum(['NO_ACTION', 'PARTIAL_REFUND', 'FULL_REFUND']),
    percentage: z.number().int().min(1).max(99).optional(),
    reason: z.string().trim().min(10).max(2000),
    analysisId: idSchema.optional(),
    expectedVersion: z.number().int().min(0),
  })
  .strict()
  .superRefine((v, c) => {
    if ((v.type === 'PARTIAL_REFUND') !== (v.percentage !== undefined))
      c.addIssue({ code: 'custom', message: 'Only partial refunds require a percentage.' });
  });
export const approvalInputSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    version: z.number().int().positive(),
    proposalSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const groundedAssessmentSchema = assessmentSchema.safeExtend({
  commitments: z
    .array(
      z
        .object({
          commitmentId: idSchema,
          deliverableMatch: z.number().int().min(0).max(100).optional(),
          status: z.enum(['FULFILLED', 'PARTIALLY_FULFILLED', 'UNFULFILLED', 'UNCLEAR']),
          evidenceIds: z.array(idSchema).max(50),
          claim: z.string().max(1000),
          inference: z.string().max(1000),
          uncertainty: z.string().max(1000),
          citations: z
            .array(z.object({ evidenceId: idSchema, quote: z.string().min(1).max(1000) }).strict())
            .max(50)
            .default([]),
        })
        .strict(),
    )
    .min(1)
    .max(20),
});
export type CreatePact = z.infer<typeof createPactSchema>;
export interface PactRecord {
  id: string;
  title: string;
  agreement: string;
  status: z.infer<typeof lifecycleStatusSchema>;
  version: number;
  deadline: string | null;
  payment_condition: string;
  parties: Array<{ user_id: string; role: string; display_name: string; email: string }>;
  transaction: {
    id: string;
    amount_minor: string;
    currency: string;
    state: string;
    payer_role: string;
    refunded_minor: string;
    confirmation_pending?: boolean;
  };
  commitments: Array<{
    id: string;
    title: string;
    description: string;
    acceptance_criteria: string;
    expected_evidence: string;
    status: string;
    promised_by: string;
    deadline: string | null;
    milestones: Array<{ id: string; title: string; status: string; deadline: string | null }>;
  }>;
  evidence: Array<{
    id: string;
    title: string;
    commitment_id: string;
    uploaded_by: string;
    versions: Array<{
      id: string;
      version: number;
      state: string;
      mime_type: string;
      size_bytes: string;
      created_at: string;
      failure_code: string | null;
    }>;
  }>;
  analyses: Array<{
    id: string;
    state: string;
    failure_code: string | null;
    assessment: unknown;
    created_at: string;
  }>;
  resolutions: Array<{
    id: string;
    version: number;
    proposal: {
      type: string;
      percentage?: number;
      reason: string;
      amountMinor: string;
      currency: string;
      proposalSha256: string;
    };
    retired_at: string | null;
    approvals: Array<{ user_id: string; decision: string }>;
    execution?: { status: string } | null;
  }>;
  audit: Array<{
    id: string;
    event_type: string;
    created_at: string;
    label?: string;
    reason?: string;
    actorName?: string;
  }>;
}
