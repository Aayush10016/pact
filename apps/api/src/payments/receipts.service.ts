import { Inject, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { z } from 'zod';
import {
  idSchema,
  receiptKindSchema,
  type ReceiptSummary,
  type FinancialReceipt,
} from '@pact/types';
import { Database, member } from '../database/database.module';
import type { Identity } from '../auth/auth.module';
import { parse } from '../pacts/lifecycle.service';
import { PayPalProvider, minorAmount, validateCaptureOrder } from './paypal.provider';

@Injectable()
export class ReceiptsService {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(PayPalProvider) private readonly paypal: PayPalProvider,
  ) {}
  async list(pactId: string, user: Identity): Promise<ReceiptSummary[]> {
    parse(idSchema, pactId);
    return this.db.transaction(async (db) => {
      await member(db, pactId, user.id);
      return (
        await db.query(
          `SELECT CASE WHEN op.operation='CAPTURE' THEN tx.id ELSE op.id END AS id,
        CASE WHEN op.operation='CAPTURE' THEN 'payment' ELSE 'refund' END AS kind,
        op.amount_minor AS "amountMinor",tx.currency
        FROM paypal_transactions op JOIN transactions tx ON tx.id=op.transaction_id
        WHERE tx.pact_id=$1 AND op.status='CONFIRMED' AND op.operation IN ('CAPTURE','REFUND')
        AND tx.order_id IS NOT NULL AND tx.capture_id IS NOT NULL
        AND (op.operation='CAPTURE' OR op.paypal_id IS NOT NULL)
        ORDER BY op.created_at`,
          [pactId],
        )
      ).rows;
    });
  }
  async read(
    pactId: string,
    kindValue: string,
    receiptId: string,
    user: Identity,
  ): Promise<FinancialReceipt> {
    parse(idSchema, pactId);
    parse(idSchema, receiptId);
    const kind = parse(receiptKindSchema, kindValue);
    // All authorization and confirmed-state checks precede any provider readback.
    const stored = await this.db.transaction(async (db) => {
      const pact = await member(db, pactId, user.id);
      const op = (
        await db.query(
          `SELECT op.*,tx.order_id,tx.capture_id,tx.currency,tx.payer_role,
        tx.amount_minor AS captured_amount FROM paypal_transactions op JOIN transactions tx ON tx.id=op.transaction_id
        WHERE tx.pact_id=$1 AND ${kind === 'payment' ? "tx.id=$2 AND op.operation='CAPTURE'" : "op.id=$2 AND op.operation='REFUND'"}
        AND op.status='CONFIRMED'`,
          [pactId, receiptId],
        )
      ).rows[0];
      if (!op || !op.order_id || !op.capture_id || (kind === 'refund' && !op.paypal_id))
        throw new NotFoundException('A confirmed receipt is not available.');
      const parties = (
        await db.query(
          'SELECT r.role,u.display_name FROM parties r JOIN users u ON u.id=r.user_id WHERE r.pact_id=$1',
          [pactId],
        )
      ).rows;
      const confirmed = (
        await db.query(
          `SELECT created_at FROM audit_events WHERE pact_id=$1 AND
        (($3='payment' AND event_type='PAYMENT_CAPTURED' AND metadata->>'transactionId'=$2)
        OR ($3='refund' AND event_type='FINANCIAL_ACTION_EXECUTED' AND metadata->>'operationId'=$2)
        OR (event_type='PAYPAL_OPERATION_RECONCILED' AND metadata->>'operationId'=$4))
        ORDER BY created_at ASC LIMIT 1`,
          [pactId, kind === 'payment' ? op.transaction_id : op.id, kind, op.id],
        )
      ).rows[0];
      if (!confirmed) throw new NotFoundException('Provider confirmation record is not available.');
      return { pact, op, parties, confirmedAt: new Date(confirmed.created_at).toISOString() };
    });
    const { op, pact, parties } = stored;
    let providerTime: unknown;
    let merchantId: string | null = null;
    if (kind === 'payment') {
      const capture = await this.paypal.getCapture(op.capture_id);
      const order = await this.paypal.getOrder(op.order_id);
      validateCaptureOrder(order, {
        ...op,
        id: op.transaction_id,
        amount_minor: op.captured_amount,
      });
      if (
        capture.id !== op.capture_id ||
        !['COMPLETED', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(capture.status) ||
        !order.purchase_units?.[0]?.payments?.captures?.some((c) => c.id === capture.id)
      )
        throw new ConflictException('PayPal capture confirmation does not match this record.');
      if (
        !capture.amount ||
        minorAmount(capture.amount.value) !== op.amount_minor ||
        capture.amount.currency_code !== op.currency
      )
        throw new ConflictException('PayPal receipt amount does not match.');
      providerTime = capture.create_time;
      merchantId = order.purchase_units?.[0]?.payee?.merchant_id ?? null;
    } else {
      const refund = await this.paypal.getRefund(op.paypal_id);
      if (
        refund.id !== op.paypal_id ||
        refund.status !== 'COMPLETED' ||
        !refund.links?.some(
          (l) =>
            l.rel === 'up' &&
            [
              `https://api-m.sandbox.paypal.com/v2/payments/captures/${op.capture_id}`,
              `https://api.sandbox.paypal.com/v2/payments/captures/${op.capture_id}`,
            ].includes(l.href),
        )
      )
        throw new ConflictException('PayPal refund confirmation does not match this record.');
      if (
        !refund.amount ||
        minorAmount(refund.amount.value) !== op.amount_minor ||
        refund.amount.currency_code !== op.currency
      )
        throw new ConflictException('PayPal receipt amount does not match.');
      providerTime = refund.update_time ?? refund.create_time;
    }
    const time = z.iso.datetime({ offset: true }).safeParse(providerTime);
    return {
      id: receiptId,
      kind,
      status: 'COMPLETED',
      provider: 'PayPal Sandbox',
      merchantId,
      pactId,
      pactTitle: pact.title,
      amountMinor: op.amount_minor,
      currency: op.currency,
      orderId: op.order_id,
      captureId: op.capture_id,
      refundId: kind === 'refund' ? op.paypal_id : null,
      occurredAt: time.success ? time.data : null,
      confirmedAt: stored.confirmedAt,
      payer: parties.find((p) => p.role === op.payer_role)?.display_name ?? 'Pact payer',
      payee: parties.find((p) => p.role !== op.payer_role)?.display_name ?? 'Pact payee',
    };
  }
}
