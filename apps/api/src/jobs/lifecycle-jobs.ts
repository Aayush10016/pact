import { Injectable, Inject, ConflictException, ForbiddenException } from '@nestjs/common';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { groundedAssessmentSchema } from '@pact/types';
import { Database, audit, notify } from '../database/database.module';
import { evidenceSnapshot } from '../assessments/assessments.module';
import { EvidenceStorage } from '../evidence/storage';
import { EvidenceScanner } from '../evidence/scanner';
import { UnrecoverableError } from 'bullmq';
import {
  PayPalProvider,
  ProviderError,
  minorAmount,
  validateCaptureOrder,
} from '../payments/paypal.provider';
export function confirmAmount(
  amount: { currency_code: string; value: string } | undefined,
  minor: string,
  currency: string,
) {
  if (!amount || amount.currency_code !== currency || minorAmount(amount.value) !== minor)
    throw new Error('Provider amount mismatch');
}
@Injectable()
export class LifecycleJobs {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(EvidenceStorage) readonly storage: EvidenceStorage,
    @Inject(PayPalProvider) readonly paypal: PayPalProvider,
    @Inject(EvidenceScanner) readonly scanner: EvidenceScanner,
  ) {}
  async process(kind: string, id: string) {
    if (kind === 'EVIDENCE') return this.evidence(id);
    if (kind === 'ASSESSMENT') return this.assessment(id);
    if (kind === 'PAYMENT') return this.payment(id);
    if (kind === 'WEBHOOK') return this.webhook(id);
    throw new Error('Unknown job kind');
  }
  private async ai(path: string, body: BodyInit, contentType: string) {
    if (!process.env.AI_SERVICE_URL || !process.env.AI_SERVICE_KEY)
      throw new Error('AI_UNAVAILABLE');
    const base = new URL(process.env.AI_SERVICE_URL);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password)
      throw new Error('AI_UNAVAILABLE');
    const response = await fetch(new URL(path, base), {
      method: 'POST',
      headers: { 'content-type': contentType, 'x-pact-service-key': process.env.AI_SERVICE_KEY },
      body,
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw new Error('AI_UNAVAILABLE');
    const text = await response.text();
    if (text.length > 1024 * 1024) throw new Error('AI_OUTPUT_INVALID');
    return JSON.parse(text) as unknown;
  }
  async evidence(id: string) {
    const v = (
      await this.db.query(
        'SELECT v.*,e.pact_id FROM evidence_versions v JOIN evidence e ON e.id=v.evidence_id WHERE v.id=$1',
        [id],
      )
    ).rows[0];
    if (!v || v.purged_at || (v.state === 'READY' && v.scan_state === 'CLEAN')) return;
    if (v.scan_state === 'INFECTED') throw new UnrecoverableError('MALWARE_DETECTED');
    const bytes = await this.storage.read(v.object_key);
    if (createHash('sha256').update(bytes).digest('hex') !== v.content_sha256)
      throw new Error('EVIDENCE_INTEGRITY_FAILED');
    let verdict: 'CLEAN' | 'INFECTED';
    try {
      verdict = await this.scanner.scan(bytes);
    } catch {
      await this.db.transaction(async (db) => {
        await db.query(
          "UPDATE evidence_versions SET scan_state='ERROR',state='FAILED',failure_code='SCANNER_UNAVAILABLE',updated_at=now() WHERE id=$1",
          [id],
        );
        await audit(db, v.pact_id, null, 'EVIDENCE_SCAN_FAILED', { versionId: id });
        await notify(db, v.pact_id, 'EVIDENCE_SCAN_FAILED');
      });
      throw new Error('SCANNER_UNAVAILABLE');
    }
    await this.db.transaction(async (db) => {
      await db.query(
        "UPDATE evidence_versions SET scan_state=$2,scanned_at=now(),state=CASE WHEN $2='INFECTED' THEN 'FAILED' ELSE state END,failure_code=CASE WHEN $2='INFECTED' THEN 'MALWARE_DETECTED' ELSE NULL END,updated_at=now() WHERE id=$1",
        [id, verdict],
      );
      await audit(
        db,
        v.pact_id,
        null,
        verdict === 'CLEAN' ? 'EVIDENCE_SCAN_CLEAN' : 'EVIDENCE_QUARANTINED',
        { versionId: id },
      );
    });
    if (verdict === 'INFECTED') {
      await this.db.transaction(async (db) => {
        await notify(db, v.pact_id, 'EVIDENCE_QUARANTINED');
      });
      throw new UnrecoverableError('MALWARE_DETECTED');
    }
    const result = z
      .object({ data: z.object({ text: z.string().min(1).max(10000) }) })
      .parse(await this.ai('/v1/extract', Buffer.from(bytes), v.mime_type));
    await this.db.transaction(async (db) => {
      const changed = await db.query(
        "UPDATE evidence_versions SET state='READY',extracted_text=$2,failure_code=NULL,updated_at=now() WHERE id=$1 AND state<>'READY' RETURNING id",
        [id, result.data.text],
      );
      if (changed.rowCount)
        await audit(db, v.pact_id, null, 'EVIDENCE_PROCESSED', { versionId: id });
    });
  }
  async assessment(id: string) {
    const a = (await this.db.query('SELECT * FROM ai_analyses WHERE id=$1', [id])).rows[0];
    if (!a || a.state === 'READY') return;
    const parsed = z
      .object({ data: groundedAssessmentSchema, model: z.string().min(1) })
      .parse(
        await this.ai('/v1/assessments', JSON.stringify(a.input_snapshot), 'application/json'),
      );
    const known = a.input_snapshot.evidence.map((e: { id: string }) => e.id) as string[];
    const required = a.input_snapshot.commitments.map((c: { id: string }) => c.id) as string[];
    const value = parsed.data;
    const sources = new Map<string, string>(
      a.input_snapshot.evidence.map((e: { id: string; content: string }) => [e.id, e.content]),
    );
    for (const commitment of value.commitments) {
      if (
        commitment.citations.some(
          (c) =>
            !commitment.evidenceIds.includes(c.evidenceId) ||
            !sources.get(c.evidenceId)?.includes(c.quote),
        ) ||
        (commitment.claim &&
          !commitment.citations.some((c) => c.quote.includes(commitment.claim))) ||
        (commitment.status !== 'UNCLEAR' && !commitment.citations.length)
      )
        throw new Error('AI_CITATION_INVALID');
    }
    if (
      value.commitments.length !== required.length ||
      new Set(value.commitments.map((c) => c.commitmentId)).size !== required.length ||
      value.commitments.some(
        (c) =>
          !required.includes(c.commitmentId) ||
          c.evidenceIds.some((e) => !known.includes(e)) ||
          (c.status !== 'UNCLEAR' && !c.evidenceIds.length),
      ) ||
      [...value.supportingEvidence, ...value.conflictingEvidence].some((e) => !known.includes(e))
    )
      throw new Error('AI_OUTPUT_INVALID');
    if (
      (value.status === 'UNCLEAR' ||
        value.missingEvidence.length ||
        a.input_snapshot.unavailableEvidence.length) &&
      value.confidence > 0.5
    )
      throw new Error('AI_CONFIDENCE_INVALID');
    await this.db.transaction(async (db) => {
      const changed = await db.query(
        "UPDATE ai_analyses SET state='READY',assessment=$2,model=$3,updated_at=now(),failure_code=NULL WHERE id=$1 AND state<>'READY' RETURNING id",
        [id, JSON.stringify(value), parsed.model],
      );
      if (changed.rowCount)
        await audit(db, a.pact_id, null, 'ASSESSMENT_COMPLETED', { analysisId: id });
    });
  }
  async payment(id: string) {
    const claim = await this.db.transaction(async (db) => {
      const reference = (
        await db.query(
          'SELECT tx.pact_id FROM paypal_transactions op JOIN transactions tx ON tx.id=op.transaction_id WHERE op.id=$1',
          [id],
        )
      ).rows[0];
      if (!reference) return null;
      const p = (await db.query('SELECT * FROM pacts WHERE id=$1 FOR UPDATE', [reference.pact_id]))
        .rows[0];
      const op = (await db.query('SELECT * FROM paypal_transactions WHERE id=$1 FOR UPDATE', [id]))
        .rows[0];
      // A crashed or ambiguous attempt requires readback, never another financial POST.
      if (
        [
          'EXECUTING',
          'NEEDS_RECONCILIATION',
          'PROVIDER_ACCEPTED',
          'CONFIRMED',
          'CANCELLED',
          'FAILED',
        ].includes(op.status)
      )
        return null;
      if (!['ACTIVE', 'DISPUTED'].includes(p.status)) throw new ConflictException('Pact closed');
      const tx = (
        await db.query('SELECT * FROM transactions WHERE id=$1 FOR UPDATE', [op.transaction_id])
      ).rows[0];
      const members = (await db.query('SELECT user_id,role FROM parties WHERE pact_id=$1', [p.id]))
        .rows;
      if (!members.some((m) => m.user_id === op.actor_id)) throw new ForbiddenException();
      if (op.operation === 'REFUND') {
        const r = (
          await db.query(
            'SELECT * FROM resolutions WHERE id=$1 AND pact_id=$2 AND retired_at IS NULL',
            [op.resolution_id, p.id],
          )
        ).rows[0];
        const approvals = (
          await db.query('SELECT * FROM approvals WHERE resolution_id=$1', [op.resolution_id])
        ).rows;
        if (
          !r ||
          tx.state !== 'CAPTURED' ||
          !tx.capture_id ||
          members.length !== 2 ||
          approvals.length !== 2 ||
          !members.every((m) =>
            approvals.some(
              (a) =>
                a.user_id === m.user_id &&
                a.decision === 'APPROVED' &&
                a.resolution_version === r.version &&
                a.proposal_sha256 === r.proposal.proposalSha256,
            ),
          ) ||
          r.proposal.amountMinor !== op.amount_minor
        )
          throw new ForbiddenException('Financial consent is invalid');
        if (
          JSON.stringify((await evidenceSnapshot(db, p.id)).map((v) => v.id).sort()) !==
          JSON.stringify(r.proposal.evidenceVersionIds)
        )
          throw new ConflictException('Evidence changed');
        if (
          BigInt(op.amount_minor) <= 0n ||
          BigInt(op.amount_minor) > BigInt(tx.amount_minor) - BigInt(tx.refunded_minor)
        )
          throw new ConflictException('Invalid refund amount');
      } else {
        if (
          p.status !== 'ACTIVE' ||
          !members.some((m) => m.user_id === op.actor_id && m.role === tx.payer_role) ||
          !['CREATED', 'AUTHORIZED'].includes(tx.state)
        )
          throw new ForbiddenException('Payment authorization is invalid');
      }
      await db.query(
        "UPDATE paypal_transactions SET status='EXECUTING',updated_at=now() WHERE id=$1",
        [id],
      );
      await audit(db, p.id, op.actor_id, 'FINANCIAL_OPERATION_STARTED', {
        operationId: id,
        operation: op.operation,
      });
      return { op, tx, p };
    });
    if (!claim) return;
    const { op, tx, p } = claim;
    try {
      let response: Record<string, unknown>;
      let externalId: string;
      if (op.operation === 'ORDER') {
        const result = await this.paypal.createOrder(
          tx.id,
          tx.amount_minor,
          tx.currency,
          op.request_id,
          p.id,
        );
        const href = result.links?.find((l) => ['payer-action', 'approve'].includes(l.rel))?.href;
        if (!href || !/^https:\/\/(?:www\.)?sandbox\.paypal\.com\//.test(href))
          throw new ProviderError(true);
        response = { orderId: result.id, approvalUrl: href };
        externalId = result.id;
      } else if (op.operation === 'CAPTURE') {
        const order = await this.paypal.getOrder(tx.order_id);
        validateCaptureOrder(order, tx);
        if (order.status !== 'APPROVED' && order.status !== 'COMPLETED')
          throw new ConflictException('Approve the PayPal order before capture');
        let result = order;
        if (order.status !== 'COMPLETED') {
          await this.paypal.capture(tx.order_id, op.request_id);
          // Read the full order after the POST. Minimal capture representations may omit unit amounts.
          // A failed readback remains uncertain and must never trigger another financial POST.
          try {
            result = await this.paypal.getOrder(tx.order_id);
            validateCaptureOrder(result, tx);
          } catch (error) {
            throw new ProviderError(true, error instanceof ProviderError ? error.diagnostic : {});
          }
        }
        const capture = result.purchase_units?.flatMap((u) => u.payments?.captures ?? [])[0];
        if (!capture) throw new ProviderError(true);
        confirmAmount(capture.amount, tx.amount_minor, tx.currency);
        response = { captureId: capture.id };
        externalId = capture.id;
      } else {
        const capture = await this.paypal.getCapture(tx.capture_id);
        if (capture.id !== tx.capture_id || capture.status !== 'COMPLETED')
          throw new ConflictException('Capture requires reconciliation');
        confirmAmount(capture.amount, tx.amount_minor, tx.currency);
        const result = await this.paypal.refund(
          tx.capture_id,
          op.amount_minor,
          tx.currency,
          op.request_id,
        );
        confirmAmount(result.amount, op.amount_minor, tx.currency);
        response = { refundId: result.id };
        externalId = result.id;
      }
      await this.db.transaction(async (db) => {
        await db.query('SELECT id FROM pacts WHERE id=$1 FOR UPDATE', [p.id]);
        await db.query(
          "UPDATE paypal_transactions SET status=CASE WHEN status='CONFIRMED' THEN status ELSE 'PROVIDER_ACCEPTED' END,paypal_id=$2,response=$3,updated_at=now(),failure_code=NULL WHERE id=$1",
          [id, externalId, JSON.stringify(response)],
        );
        if (op.operation === 'ORDER')
          await db.query('UPDATE transactions SET order_id=$2,updated_at=now() WHERE id=$1', [
            tx.id,
            externalId,
          ]);
        await audit(db, p.id, op.actor_id, 'FINANCIAL_ACTION_SUBMITTED', { operationId: id });
      });
    } catch (e) {
      await this.db.query(
        "UPDATE paypal_transactions SET status=$2,failure_code='PROVIDER_OR_AUTHORIZATION_FAILURE',updated_at=now() WHERE id=$1 AND status<>'CONFIRMED'",
        [
          id,
          op.status === 'NEEDS_RECONCILIATION' ||
          (e instanceof ProviderError
            ? e.uncertain
            : !(e instanceof ConflictException || e instanceof ForbiddenException))
            ? 'NEEDS_RECONCILIATION'
            : 'FAILED',
        ],
      );
      await this.db.transaction(async (db) => {
        await audit(db, p.id, op.actor_id, 'PAYMENT_RECONCILIATION_REQUIRED', {
          operationId: id,
          ...(e instanceof ProviderError ? e.diagnostic : {}),
        });
        await notify(db, p.id, 'PAYMENT_RECONCILIATION_REQUIRED');
      });
      throw e;
    }
  }
  async webhook(id: string) {
    const event = (
      await this.db.query(
        "SELECT * FROM paypal_webhook_events WHERE id=$1 AND verification_status='VERIFIED' AND processed_at IS NULL",
        [id],
      )
    ).rows[0];
    if (!event) return;
    const payload = event.payload as {
      resource: {
        id?: string;
        supplementary_data?: { related_ids?: { order_id?: string; capture_id?: string } };
      };
    };
    const resource = payload.resource;
    let transactionId: string | null = null;
    let kind = 'IGNORED';
    let captureId: string | undefined;
    let refundOpId: string | undefined;
    let refundMinor: string | undefined;
    if (event.event_type === 'CHECKOUT.ORDER.APPROVED' && resource.id) {
      const tx = (
        await this.db.query('SELECT * FROM transactions WHERE order_id=$1', [resource.id])
      ).rows[0];
      if (tx) {
        const order = await this.paypal.getOrder(resource.id);
        if (order.status !== 'APPROVED' && order.status !== 'COMPLETED')
          throw new Error('Order not approved');
        const unit = order.purchase_units?.find((u) => u.custom_id === tx.id);
        confirmAmount(unit?.amount, tx.amount_minor, tx.currency);
        transactionId = tx.id;
        kind = 'AUTHORIZED';
      }
    }
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED' && resource.id) {
      const capture = await this.paypal.getCapture(resource.id);
      if (capture.status !== 'COMPLETED') throw new Error('Capture not confirmed');
      const orderId =
        capture.supplementary_data?.related_ids?.order_id ??
        resource.supplementary_data?.related_ids?.order_id;
      if (orderId) {
        const tx = (await this.db.query('SELECT * FROM transactions WHERE order_id=$1', [orderId]))
          .rows[0];
        if (tx) {
          const order = await this.paypal.getOrder(orderId);
          if (
            !order.purchase_units?.some(
              (u) =>
                u.custom_id === tx.id && u.payments?.captures?.some((c) => c.id === capture.id),
            )
          )
            throw new Error('Capture ownership mismatch');
          confirmAmount(capture.amount, tx.amount_minor, tx.currency);
          transactionId = tx.id;
          captureId = capture.id;
          kind = 'CAPTURED';
        }
      }
    }
    if (event.event_type === 'PAYMENT.CAPTURE.DENIED' && resource.id) {
      const capture = await this.paypal.getCapture(resource.id);
      const orderId = capture.supplementary_data?.related_ids?.order_id;
      if (capture.id !== resource.id || capture.status !== 'DECLINED' || !orderId)
        throw new Error('Declined capture requires authoritative readback');
      const tx = (await this.db.query('SELECT * FROM transactions WHERE order_id=$1', [orderId]))
        .rows[0];
      if (tx) {
        const order = await this.paypal.getOrder(orderId);
        if (
          order.id !== orderId ||
          !order.purchase_units?.some(
            (u) => u.custom_id === tx.id && u.payments?.captures?.some((c) => c.id === capture.id),
          )
        )
          throw new Error('Declined capture ownership mismatch');
        confirmAmount(capture.amount, tx.amount_minor, tx.currency);
        transactionId = tx.id;
        kind = 'DECLINED';
      }
    }
    if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED' && resource.id) {
      const related = resource.supplementary_data?.related_ids?.capture_id ?? resource.id;
      const op = (
        await this.db.query(
          "SELECT op.*,tx.pact_id,tx.capture_id,tx.currency FROM paypal_transactions op JOIN transactions tx ON tx.id=op.transaction_id WHERE op.operation='REFUND' AND (op.paypal_id=$1 OR tx.capture_id=$2) AND op.status IN ('PROVIDER_ACCEPTED','CONFIRMED','EXECUTING','NEEDS_RECONCILIATION')",
          [resource.id, related],
        )
      ).rows[0];
      if (op) {
        if (!op.paypal_id) throw new Error('Refund confirmation is still pending');
        const refund = await this.paypal.getRefund(op.paypal_id);
        if (refund.status !== 'COMPLETED') throw new Error('Refund not completed');
        confirmAmount(refund.amount, op.amount_minor, op.currency);
        if (
          !refund.links?.some(
            (l) =>
              l.rel === 'up' &&
              [
                `https://api-m.sandbox.paypal.com/v2/payments/captures/${op.capture_id}`,
                `https://api.sandbox.paypal.com/v2/payments/captures/${op.capture_id}`,
              ].includes(l.href),
          )
        )
          throw new Error('Refund ownership mismatch');
        transactionId = op.transaction_id;
        refundOpId = op.id;
        refundMinor = op.amount_minor;
        kind = 'REFUNDED';
      } else {
        const tx = (
          await this.db.query('SELECT * FROM transactions WHERE capture_id=$1', [related])
        ).rows[0];
        if (tx) {
          const capture = await this.paypal.getCapture(tx.capture_id);
          if (!['REFUNDED', 'PARTIALLY_REFUNDED'].includes(capture.status))
            throw new Error('External refund not confirmed');
          transactionId = tx.id;
          kind = 'RECONCILIATION';
        }
      }
    }
    await this.db.transaction(async (db) => {
      if (transactionId) {
        const reference = (
          await db.query('SELECT pact_id FROM transactions WHERE id=$1', [transactionId])
        ).rows[0];
        const p = (
          await db.query('SELECT * FROM pacts WHERE id=$1 FOR UPDATE', [reference.pact_id])
        ).rows[0];
        const receipt = await db.query(
          'SELECT processed_at FROM paypal_webhook_events WHERE id=$1 FOR UPDATE',
          [id],
        );
        if (receipt.rows[0].processed_at) return;
        const tx = (
          await db.query('SELECT * FROM transactions WHERE id=$1 FOR UPDATE', [transactionId])
        ).rows[0];
        await audit(db, p.id, null, 'PAYPAL_WEBHOOK_RECEIVED', {
          paypalEventId: event.provider_event_id,
        });
        if (kind === 'AUTHORIZED' && tx.state === 'CREATED')
          await db.query(
            "UPDATE transactions SET state='AUTHORIZED',updated_at=now(),version=version+1 WHERE id=$1",
            [tx.id],
          );
        if (kind === 'CAPTURED' && ['CREATED', 'AUTHORIZED'].includes(tx.state)) {
          if (tx.state === 'CREATED')
            await audit(db, p.id, null, 'PAYMENT_AUTHORIZED_BY_PROVIDER', { transactionId: tx.id });
          await db.query(
            "UPDATE transactions SET state='CAPTURED',capture_id=$2,updated_at=now(),version=version+1 WHERE id=$1",
            [tx.id, captureId],
          );
          await db.query(
            "UPDATE paypal_transactions SET status='CONFIRMED' WHERE transaction_id=$1 AND operation='CAPTURE'",
            [tx.id],
          );
          await audit(db, p.id, null, 'PAYMENT_CAPTURED', { transactionId: tx.id });
        }
        if (kind === 'REFUNDED' && refundOpId) {
          const op = (
            await db.query('SELECT status FROM paypal_transactions WHERE id=$1 FOR UPDATE', [
              refundOpId,
            ])
          ).rows[0];
          if (op.status !== 'CONFIRMED') {
            if (
              tx.state !== 'CAPTURED' ||
              BigInt(tx.refunded_minor) + BigInt(refundMinor!) > BigInt(tx.amount_minor)
            )
              throw new Error('Refund state mismatch');
            await db.query(
              "UPDATE transactions SET state='COMPLETED',refunded_minor=refunded_minor+$2,version=version+1,updated_at=now() WHERE id=$1",
              [tx.id, refundMinor],
            );
            await db.query(
              "UPDATE paypal_transactions SET status='CONFIRMED',updated_at=now() WHERE id=$1",
              [refundOpId],
            );
            await db.query(
              'UPDATE pacts SET status=$2,version=version+1,updated_at=now() WHERE id=$1',
              [p.id, p.status === 'DISPUTED' ? 'RESOLVED' : 'COMPLETED'],
            );
            await audit(db, p.id, null, 'FINANCIAL_ACTION_EXECUTED', { operationId: refundOpId });
          }
        }
        if (kind === 'DECLINED' && ['CREATED', 'AUTHORIZED'].includes(tx.state)) {
          await db.query(
            "UPDATE transactions SET state='FAILED',version=version+1,updated_at=now() WHERE id=$1",
            [tx.id],
          );
          await db.query(
            "UPDATE paypal_transactions SET status='FAILED',failure_code='PROVIDER_DECLINED',updated_at=now() WHERE transaction_id=$1 AND operation='CAPTURE' AND status<>'CONFIRMED'",
            [tx.id],
          );
          await audit(db, p.id, null, 'PAYMENT_DECLINED', { transactionId: tx.id });
          await notify(db, p.id, 'PAYMENT_DECLINED');
        }
        if (kind === 'RECONCILIATION') {
          await db.query("UPDATE transactions SET state='FAILED',updated_at=now() WHERE id=$1", [
            tx.id,
          ]);
          await audit(db, p.id, null, 'PAYMENT_RECONCILIATION_REQUIRED', { transactionId: tx.id });
        }
        await audit(db, p.id, null, 'PAYPAL_STATE_CONFIRMED', { transactionId: tx.id });
      }
      await db.query(
        'UPDATE paypal_webhook_events SET processed_at=now(),processing_status=$2,failure_code=NULL WHERE id=$1',
        [id, kind === 'IGNORED' ? 'IGNORED' : 'PROCESSED'],
      );
    });
  }
  async failed(kind: string, id: string) {
    if (kind === 'EVIDENCE' || kind === 'ASSESSMENT') {
      const reference = (
        await this.db.query(
          kind === 'EVIDENCE'
            ? 'SELECT e.pact_id FROM evidence_versions v JOIN evidence e ON e.id=v.evidence_id WHERE v.id=$1'
            : 'SELECT pact_id FROM ai_analyses WHERE id=$1',
          [id],
        )
      ).rows[0];
      if (reference)
        await this.db.transaction(async (db) => {
          const event = kind === 'EVIDENCE' ? 'EVIDENCE_PROCESSING_FAILED' : 'ASSESSMENT_FAILED';
          await audit(db, reference.pact_id, null, event, { resourceId: id });
          await notify(db, reference.pact_id, event);
        });
    }
    if (kind === 'EVIDENCE')
      await this.db.query(
        "UPDATE evidence_versions SET state='FAILED',failure_code=COALESCE(failure_code,'EXTRACTION_UNAVAILABLE'),updated_at=now() WHERE id=$1 AND state<>'READY'",
        [id],
      );
    if (kind === 'ASSESSMENT')
      await this.db.query(
        "UPDATE ai_analyses SET state='FAILED',failure_code='ASSESSMENT_UNAVAILABLE',updated_at=now() WHERE id=$1 AND state<>'READY'",
        [id],
      );
    if (kind === 'WEBHOOK')
      await this.db.query(
        "UPDATE paypal_webhook_events SET processing_status='FAILED',failure_code='RECONCILIATION_REQUIRED' WHERE id=$1 AND processed_at IS NULL",
        [id],
      );
  }
}
