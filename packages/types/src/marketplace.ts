import { z } from 'zod';
export const serviceInputSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(20).max(4000),
    category: z.string().trim().min(2).max(60),
    acceptanceCriteria: z.string().trim().min(10).max(2000),
    expectedEvidence: z.string().trim().min(3).max(1000),
    amountMinor: z
      .string()
      .regex(/^[1-9]\d{0,8}$/)
      .refine((v) => BigInt(v) >= 100n && BigInt(v) <= 100000000n),
    currency: z.enum(['USD', 'EUR', 'GBP']),
    deliveryDays: z.number().int().min(1).max(365),
    published: z.boolean(),
  })
  .strict();
export const serviceWriteSchema = serviceInputSchema
  .extend({
    requestId: z.uuid(),
    expectedVersion: z.number().int().min(0),
  })
  .strict();
export const serviceAgreementSchema = z
  .object({
    requestId: z.uuid(),
    expectedVersion: z.number().int().positive(),
    paymentCondition: z.string().trim().min(10).max(1000),
    acceptedTerms: z.literal(true),
  })
  .strict();
export interface ServiceListing {
  id: string;
  owner_id: string;
  display_name: string;
  title: string;
  description: string;
  category: string;
  acceptance_criteria: string;
  expected_evidence: string;
  amount_minor: string;
  currency: 'USD' | 'EUR' | 'GBP';
  delivery_days: number;
  published: boolean;
  version: number;
  paypal_ready: boolean;
  review_count: number;
  average_rating: string | null;
}
export interface PayPalAccountStatus {
  configured: boolean;
  status: 'NOT_CONNECTED' | 'PENDING' | 'READY' | 'RESTRICTED' | 'REVOKED';
  checkedAt: string | null;
  onboardingUrl: string | null;
}
