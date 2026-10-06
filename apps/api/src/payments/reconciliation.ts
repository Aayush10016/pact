import {
  Injectable,
  Inject,
  ForbiddenException,
  ConflictException,
  Controller,
  Post,
  Get,
  Param,
  Body,
  Req,
  UseGuards,
  Module,
} from '@nestjs/common';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { idSchema } from '@pact/types';
import {
  AuthModule,
  AuthenticationGuard,
  type AuthRequest,
  type Identity,
} from '../auth/auth.module';
import { Database, audit } from '../database/database.module';
import { parse } from '../pacts/lifecycle.service';
import { PayPalProvider, minorAmount } from './paypal.provider';
import { PaymentsModule } from './payments.module';
import { retentionDecision } from '../evidence/retention';

const inputSchema = z
  .object({
    requestId: idSchema,
    expectedStatus: z.enum(['NEEDS_RECONCILIATION', 'EXECUTING', 'PROVIDER_ACCEPTED']),
    expectedTransactionVersion: z.number().int().positive(),
    providerId: z.string().regex(/^[A-Za-z0-9-]{1,100}$/),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();
function amountMatches(
  amount: { currency_code: string; value: string } | undefined,
  minor: string,
  currency: string,
) {
  if (!amount || amount.currency_code !== currency || minorAmount(amount.value) !== minor)
    throw new ConflictException('Provider amount mismatch.');
}
@Injectable()
export class ReconciliationService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(PayPalProvider) readonly paypal: PayPalProvider,
  ) {}
  private operator(actor: Identity) {
    if (
      !(process.env.PACT_OPERATOR_SUBJECTS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .includes(actor.subject)
    )
      throw new ForbiddenException('Operator access required.');
  }
  async monitoring(actor: Identity) {
    this.operator(actor);
    const financial = (
      await this.db.query(
        "SELECT status,count(*)::int AS count FROM paypal_transactions WHERE status IN ('NEEDS_RECONCILIATION','EXECUTING','PROVIDER_ACCEPTED','FAILED') GROUP BY status",
      )
    ).rows;
    const scanning = (
      await this.db.query(
        "SELECT scan_state,count(*)::int AS count FROM evidence_versions WHERE scan_state<>'CLEAN' GROUP BY scan_state",
      )
    ).rows;
    const failures = (
      await this.db.query(
        "SELECT 'WEBHOOK' AS kind,count(*)::int AS count FROM paypal_webhook_events WHERE processing_status='FAILED' UNION ALL SELECT 'ASSESSMENT',count(*)::int FROM ai_analyses WHERE state='FAILED' UNION ALL SELECT 'OUTBOX_PENDING',count(*)::int FROM outbox_jobs WHERE published_at IS NULL",
      )
    ).rows;
    return { financial, scanning, failures, paypalConfigured: this.paypal.enabled() };
  }
  async retention(versionId: string, actor: Identity) {
    this.operator(actor);
    parse(idSchema, versionId);
    return this.db.transaction(async (db) => {
      const v = (
        await db.query(
          "SELECT e.pact_id,GREATEST(v.created_at,p.updated_at,t.updated_at) AS retention_anchor,v.legal_hold,p.status AS pact_status,t.state AS payment_state,(SELECT count(*)::int FROM paypal_transactions op WHERE op.transaction_id=t.id AND op.status NOT IN ('CONFIRMED','CANCELLED')) AS attempts,(SELECT count(*)::int FROM paypal_webhook_events WHERE processed_at IS NULL) AS pending_webhooks,EXISTS(SELECT 1 FROM resolutions r WHERE r.pact_id=p.id AND r.retired_at IS NULL) AS open_resolution FROM evidence_versions v JOIN evidence e ON e.id=v.evidence_id JOIN pacts p ON p.id=e.pact_id JOIN transactions t ON t.pact_id=p.id WHERE v.id=$1 FOR UPDATE OF v,p,t",
          [versionId],
        )
      ).rows[0];
      if (!v) throw new ConflictException('Evidence version not found.');
      const decision = retentionDecision({
        createdAt: v.retention_anchor,
        pactStatus: v.pact_status,
        paymentState: v.payment_state,
        legalHold: v.legal_hold,
        unresolvedFinancialAttempts: v.attempts,
        pendingWebhooks: v.pending_webhooks,
        unretiredResolution: v.open_resolution,
      });
      await audit(db, v.pact_id, actor.id, 'RETENTION_REVIEWED', {
        versionId,
        reason: decision.reason,
      });
      return {
        ...decision,
        minimumDays: 365,
        deletion: 'DISABLED',
        auditAndFinancialRecords: 'PRESERVED',
      };
    });
  }
  async reconcile(operationId: string, actor: Identity, raw: unknown) {
    const operators = (process.env.PACT_OPERATOR_SUBJECTS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!operators.includes(actor.subject))
      throw new ForbiddenException('Operator access required.');
    parse(idSchema, operationId);
    const input = parse(inputSchema, raw);
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ operationId, actorId: actor.id, ...input }))
      .digest('hex');
    const prior = (
      await this.db.query(
        'SELECT fingerprint,outcome FROM reconciliation_reviews WHERE request_id=$1',
        [input.requestId],
      )
    ).rows[0];
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new ConflictException('Reconciliation key reused.');
      return prior.outcome;
    }
    const op = (
      await this.db.query(
        'SELECT op.*,tx.pact_id,tx.order_id,tx.capture_id,tx.currency,tx.amount_minor AS captured_amount FROM paypal_transactions op JOIN transactions tx ON tx.id=op.transaction_id WHERE op.id=$1',
        [operationId],
      )
    ).rows[0];
    if (
      !op ||
      op.status !== input.expectedStatus ||
      (op.paypal_id && op.paypal_id !== input.providerId)
    )
      throw new ConflictException('Operation changed. Refresh before reconciliation.');
    if (
      op.status === 'EXECUTING' &&
      Date.now() - new Date(op.updated_at).getTime() < 10 * 60 * 1000
    )
      throw new ConflictException('The provider request may still be running.');
    await this.db.transaction(async (db) => {
      await audit(db, op.pact_id, actor.id, 'RECONCILIATION_READBACK_REQUESTED', {
        operationId,
        requestId: input.requestId,
      });
    });
    // This service exposes GET/readback only. It never invokes createOrder/capture/refund.
    if (op.operation === 'ORDER') {
      const order = await this.paypal.getOrder(input.providerId);
      if (
        order.id !== input.providerId ||
        !['CREATED', 'APPROVED', 'COMPLETED'].includes(order.status) ||
        order.purchase_units?.length !== 1 ||
        order.purchase_units[0]?.custom_id !== op.transaction_id
      )
        throw new ConflictException('Order ownership mismatch.');
      amountMatches(order.purchase_units[0]?.amount, op.amount_minor, op.currency);
    } else if (op.operation === 'CAPTURE') {
      if (!op.order_id) throw new ConflictException('Stored order is required.');
      const capture = await this.paypal.getCapture(input.providerId);
      const order = await this.paypal.getOrder(op.order_id);
      if (
        capture.id !== input.providerId ||
        capture.status !== 'COMPLETED' ||
        order.id !== op.order_id ||
        order.purchase_units?.length !== 1 ||
        order.purchase_units[0]?.custom_id !== op.transaction_id ||
        !order.purchase_units[0]?.payments?.captures?.some((c) => c.id === capture.id)
      )
        throw new ConflictException('Capture ownership or completion mismatch.');
      amountMatches(capture.amount, op.amount_minor, op.currency);
      amountMatches(order.purchase_units[0]?.amount, op.captured_amount, op.currency);
    } else if (op.operation === 'REFUND') {
      if (!op.capture_id || !op.resolution_id)
        throw new ConflictException('Authorized refund record required.');
      const refund = await this.paypal.getRefund(input.providerId);
      if (
        refund.id !== input.providerId ||
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
        throw new ConflictException('Refund ownership or completion mismatch.');
      amountMatches(refund.amount, op.amount_minor, op.currency);
    } else throw new ConflictException('Unsupported operation.');
    return this.db.transaction(async (db) => {
      const p = (await db.query('SELECT * FROM pacts WHERE id=$1 FOR UPDATE', [op.pact_id]))
        .rows[0];
      const tx = (
        await db.query('SELECT * FROM transactions WHERE id=$1 FOR UPDATE', [op.transaction_id])
      ).rows[0];
      const current = (
        await db.query('SELECT * FROM paypal_transactions WHERE id=$1 FOR UPDATE', [operationId])
      ).rows[0];
      const duplicate = (
        await db.query(
          'SELECT fingerprint,outcome FROM reconciliation_reviews WHERE request_id=$1',
          [input.requestId],
        )
      ).rows[0];
      if (duplicate) {
        if (duplicate.fingerprint !== fingerprint)
          throw new ConflictException('Reconciliation key reused.');
        return duplicate.outcome;
      }
      if (
        current.status !== input.expectedStatus ||
        tx.version !== input.expectedTransactionVersion ||
        current.paypal_id !== op.paypal_id
      )
        throw new ConflictException('Financial record changed.');
      if (op.operation === 'ORDER') {
        if (tx.order_id && tx.order_id !== input.providerId)
          throw new ConflictException('Order differs from stored record.');
        await db.query(
          'UPDATE transactions SET order_id=$2,version=version+1,updated_at=now() WHERE id=$1',
          [tx.id, input.providerId],
        );
      } else if (op.operation === 'CAPTURE') {
        if (!['CREATED', 'AUTHORIZED'].includes(tx.state) || tx.capture_id)
          throw new ConflictException('Capture state changed.');
        await db.query(
          "UPDATE transactions SET state='CAPTURED',capture_id=$2,version=version+1,updated_at=now() WHERE id=$1",
          [tx.id, input.providerId],
        );
      } else {
        const r = (
          await db.query('SELECT * FROM resolutions WHERE id=$1 AND retired_at IS NULL', [
            op.resolution_id,
          ])
        ).rows[0];
        const members = (await db.query('SELECT user_id FROM parties WHERE pact_id=$1', [p.id]))
          .rows;
        const approvals = (
          await db.query('SELECT * FROM approvals WHERE resolution_id=$1', [op.resolution_id])
        ).rows;
        if (
          !r ||
          r.proposal.amountMinor !== op.amount_minor ||
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
          tx.state !== 'CAPTURED' ||
          BigInt(tx.refunded_minor) + BigInt(op.amount_minor) > BigInt(tx.amount_minor)
        )
          throw new ConflictException('Refund authorization or state mismatch.');
        await db.query(
          "UPDATE transactions SET state='COMPLETED',refunded_minor=refunded_minor+$2,version=version+1,updated_at=now() WHERE id=$1",
          [tx.id, op.amount_minor],
        );
        await db.query(
          'UPDATE pacts SET status=$2,version=version+1,updated_at=now() WHERE id=$1',
          [p.id, p.status === 'DISPUTED' ? 'RESOLVED' : 'COMPLETED'],
        );
      }
      await db.query(
        "UPDATE paypal_transactions SET status='CONFIRMED',paypal_id=$2,failure_code=NULL,updated_at=now() WHERE id=$1",
        [operationId, input.providerId],
      );
      const outcome = { operationId, status: 'CONFIRMED', source: 'OPERATOR_PROVIDER_READBACK' };
      await db.query(
        'INSERT INTO reconciliation_reviews(request_id,operation_id,actor_id,fingerprint,reason,outcome) VALUES($1,$2,$3,$4,$5,$6)',
        [
          input.requestId,
          operationId,
          actor.id,
          fingerprint,
          input.reason,
          JSON.stringify(outcome),
        ],
      );
      await audit(db, p.id, actor.id, 'PAYPAL_OPERATION_RECONCILED', {
        operationId,
        requestId: input.requestId,
        previousStatus: op.status,
        source: outcome.source,
      });
      return outcome;
    });
  }
}
@Controller('v1/operations')
@UseGuards(AuthenticationGuard)
class ReconciliationController {
  constructor(@Inject(ReconciliationService) readonly service: ReconciliationService) {}
  @Get('monitoring') async monitoring(@Req() req: AuthRequest) {
    return { data: await this.service.monitoring(req.identity) };
  }
  @Get('evidence/:vid/retention') async retention(
    @Param('vid') id: string,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.service.retention(id, req.identity) };
  }
  @Post(':oid/reconcile') async reconcile(
    @Param('oid') id: string,
    @Req() req: AuthRequest,
    @Body() input: unknown,
  ) {
    return { data: await this.service.reconcile(id, req.identity, input) };
  }
}
@Module({
  imports: [AuthModule, PaymentsModule],
  providers: [ReconciliationService],
  controllers: [ReconciliationController],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
