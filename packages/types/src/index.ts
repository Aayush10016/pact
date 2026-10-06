import { z } from 'zod';

export const pactStatusSchema = z.enum(['ACTIVE', 'IN_REVIEW', 'DISPUTED', 'COMPLETED']);
export const moneySchema = z
  .object({
    amountMinor: z.string().regex(/^[1-9]\d{0,14}$/),
    currency: z.enum(['USD', 'EUR', 'GBP', 'INR']),
  })
  .strict();
export const assessmentSchema = z
  .object({
    status: z.enum(['FULFILLED', 'PARTIALLY_FULFILLED', 'UNFULFILLED', 'UNCLEAR']),
    confidence: z.number().min(0).max(1),
    supportingEvidence: z.array(z.string().min(1)).max(100),
    conflictingEvidence: z.array(z.string().min(1)).max(100),
    missingEvidence: z.array(z.string().min(1).max(500)).max(100),
    reasoningSummary: z.string().min(1).max(4000),
    recommendation: z
      .object({
        type: z.enum(['NO_ACTION', 'REQUEST_EVIDENCE', 'PARTIAL_REFUND', 'FULL_REFUND']),
        percentage: z.number().int().min(0).max(100).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.recommendation.type === 'PARTIAL_REFUND' &&
      (value.recommendation.percentage === undefined ||
        value.recommendation.percentage <= 0 ||
        value.recommendation.percentage >= 100)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['recommendation', 'percentage'],
        message: 'Partial refunds require a percentage between 1 and 99.',
      });
    if (
      value.recommendation.type !== 'PARTIAL_REFUND' &&
      value.recommendation.percentage !== undefined
    )
      ctx.addIssue({
        code: 'custom',
        path: ['recommendation', 'percentage'],
        message: 'Percentage is only valid for a partial refund.',
      });
  });
export type Assessment = z.infer<typeof assessmentSchema>;
export type PactStatus = z.infer<typeof pactStatusSchema>;
export interface DemoPact {
  id: string;
  title: string;
  category: string;
  otherParty: string;
  initials: string;
  money: z.infer<typeof moneySchema>;
  status: PactStatus;
  due: string;
  completedMilestones: number;
  totalMilestones: number;
  nextAction: string;
}
export const draftSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    otherParty: z.email(),
    agreement: z.string().trim().min(20).max(4000),
    money: moneySchema,
    deadline: z.iso.date(),
    deliverable: z.string().trim().min(3).max(500),
    paymentCondition: z.string().trim().min(10).max(1000),
  })
  .strict();
export type PactDraft = z.infer<typeof draftSchema>;

export * from './lifecycle';
