import { z } from 'zod';
export const receiptKindSchema = z.enum(['payment', 'refund']);
export type ReceiptKind = z.infer<typeof receiptKindSchema>;
export interface ReceiptSummary {
  id: string;
  kind: ReceiptKind;
  amountMinor: string;
  currency: string;
}
export interface FinancialReceipt extends ReceiptSummary {
  status: 'COMPLETED';
  provider: 'PayPal Sandbox';
  pactId: string;
  pactTitle: string;
  orderId: string;
  captureId: string;
  refundId: string | null;
  occurredAt: string | null;
  confirmedAt: string;
  payer: string;
  payee: string;
}
export interface ActivityRecord {
  id: string;
  pact_id: string;
  title: string;
  event_type: string;
  created_at: string;
  label: string;
  receipt: ReceiptSummary | null;
}
