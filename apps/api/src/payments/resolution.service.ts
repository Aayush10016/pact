import {
  Injectable,
  Inject,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { idSchema, proposalSchema, approvalInputSchema } from '@pact/types';
import { Database, member, audit, enqueue } from '../database/database.module';
import type { Identity } from '../auth/auth.module';
import { parse } from '../pacts/lifecycle.service';
import { evidenceSnapshot } from '../assessments/assessments.module';
import {
  CheckoutUnavailableError,
  PayPalProvider,
  ProviderError,
  validateCaptureOrder,
} from './paypal.provider';
export function proposalHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
@Injectable()
export class ResolutionService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(PayPalProvider) readonly paypal: PayPalProvider,
  ) {}
  async propose(id: string, user: Identity, input: unknown) {
    parse(idSchema, id);
    const data = parse(proposalSchema, input);
    return this.db.transaction(async (db) => {
      const p = await member(db, id, user.id, true);
      if (
        (
          await db.query(
            "SELECT 1 FROM support_cases WHERE pact_id=$1 AND status IN ('OPEN','IN_REVIEW')",
            [id],
          )
        ).rowCount
      )
        throw new ConflictException('Human review is open. Continue in the case conversation.');
      if (!['ACTIVE', 'DISPUTED'].includes(p.status))
        throw new ConflictException('Pact is not open for resolution.');
      if (
        (
          await db.query(
            "SELECT 1 FROM resolutions WHERE pact_id=$1 AND retired_at IS NULL AND proposal ? 'staffDecisionId'",
            [id],
          )
        ).rowCount
      )
        throw new ConflictException(
          'A reviewer decision is already recorded. Follow its confirmation status.',
        );
      const current = await db.query(
        'SELECT version FROM resolutions WHERE pact_id=$1 ORDER BY version DESC LIMIT 1',
        [id],
      );
      const version = current.rows[0]?.version ?? 0;
      if (version !== data.expectedVersion)
        throw new ConflictException('Resolution changed. Refresh before proposing.');
      const tx = (await db.query('SELECT * FROM transactions WHERE pact_id=$1 FOR UPDATE', [id]))
        .rows[0];
      if (tx.state !== 'CAPTURED')
        throw new ConflictException('A verified captured payment is required.');
      if (
        (
          await db.query(
            "SELECT 1 FROM paypal_transactions WHERE transaction_id=$1 AND resolution_id IS NOT NULL AND status IN ('EXECUTING','PROVIDER_ACCEPTED','NEEDS_RECONCILIATION','CONFIRMED')",
            [tx.id],
          )
        ).rowCount
      )
        throw new ConflictException('A financial action is in flight or already settled.');
      if (
        data.analysisId &&
        !(
          await db.query("SELECT 1 FROM ai_analyses WHERE id=$1 AND pact_id=$2 AND state='READY'", [
            data.analysisId,
            id,
          ])
        ).rowCount
      )
        throw new NotFoundException('Assessment not found.');
      const amount =
        data.type === 'FULL_REFUND'
          ? BigInt(tx.amount_minor)
          : data.type === 'PARTIAL_REFUND'
            ? (BigInt(tx.amount_minor) * BigInt(data.percentage!)) / 100n
            : 0n;
      if (
        data.type !== 'NO_ACTION' &&
        (amount <= 0n || amount > BigInt(tx.amount_minor) - BigInt(tx.refunded_minor))
      )
        throw new ConflictException('Refund exceeds the available captured amount.');
      const snapshot = (await evidenceSnapshot(db, id)).map((v) => v.id).sort();
      if (data.analysisId) {
        const a = await db.query('SELECT evidence_version_ids FROM ai_analyses WHERE id=$1', [
          data.analysisId,
        ]);
        if (JSON.stringify([...a.rows[0].evidence_version_ids].sort()) !== JSON.stringify(snapshot))
          throw new ConflictException(
            'Assessment refers to older evidence. Request a new assessment.',
          );
      }
      const proposal = {
        type: data.type,
        ...(data.percentage ? { percentage: data.percentage } : {}),
        reason: data.reason,
        amountMinor: amount.toString(),
        currency: tx.currency,
        evidenceVersionIds: snapshot,
      };
      const sha = proposalHash(proposal);
      const retired = await db.query(
        'UPDATE resolutions SET retired_at=now() WHERE pact_id=$1 AND retired_at IS NULL RETURNING id',
        [id],
      );
      for (const r of retired.rows) {
        await db.query(
          "UPDATE paypal_transactions SET status='CANCELLED' WHERE resolution_id=$1 AND status='QUEUED'",
          [r.id],
        );
        await audit(db, id, user.id, 'APPROVALS_INVALIDATED', { resolutionId: r.id });
      }
      const r = await db.query(
        'INSERT INTO resolutions(pact_id,analysis_id,proposal,version) VALUES($1,$2,$3,$4) RETURNING id,version',
        [
          id,
          data.analysisId ?? null,
          JSON.stringify({ ...proposal, proposalSha256: sha }),
          version + 1,
        ],
      );
      await audit(db, id, user.id, version ? 'RESOLUTION_CHANGED' : 'RESOLUTION_PROPOSED', {
        resolutionId: r.rows[0].id,
        version: version + 1,
      });
      return r.rows[0];
    });
  }
  async approve(id: string, rid: string, user: Identity, input: unknown) {
    parse(idSchema, id);
    parse(idSchema, rid);
    const data = parse(approvalInputSchema, input);
    return this.db.transaction(async (db) => {
      await member(db, id, user.id, true);
      if (
        (
          await db.query(
            "SELECT 1 FROM support_cases WHERE pact_id=$1 AND status IN ('OPEN','IN_REVIEW')",
            [id],
          )
        ).rowCount
      )
        throw new ConflictException('Human review is open. Continue the case conversation.');
      const r = (
        await db.query(
          'SELECT * FROM resolutions WHERE id=$1 AND pact_id=$2 AND retired_at IS NULL',
          [rid, id],
        )
      ).rows[0];
      if (!r) throw new NotFoundException('Current resolution not found.');
      if (r.proposal.staffDecisionId)
        throw new ForbiddenException(
          'This outcome was decided by a reviewer. Follow the human-review record.',
        );
      if (r.version !== data.version || r.proposal.proposalSha256 !== data.proposalSha256)
        throw new ConflictException('Review the current financial consequence before deciding.');
      const prior = (
        await db.query('SELECT decision FROM approvals WHERE resolution_id=$1 AND user_id=$2', [
          rid,
          user.id,
        ])
      ).rows[0];
      if (prior) {
        if (prior.decision !== data.decision)
          throw new ConflictException('A recorded decision requires a new proposal to change.');
        return { id: rid, decision: prior.decision };
      }
      await db.query(
        'INSERT INTO approvals(resolution_id,user_id,decision,resolution_version,proposal_sha256) VALUES($1,$2,$3,$4,$5)',
        [rid, user.id, data.decision, r.version, data.proposalSha256],
      );
      await audit(db, id, user.id, 'APPROVAL_CREATED', {
        resolutionId: rid,
        version: r.version,
        decision: data.decision,
      });
      return { id: rid, decision: data.decision };
    });
  }
  async execute(id: string, rid: string, user: Identity) {
    parse(idSchema, id);
    parse(idSchema, rid);
    return this.db.transaction(async (db) => {
      const p = await member(db, id, user.id, true);
      if (
        (
          await db.query(
            "SELECT 1 FROM support_cases WHERE pact_id=$1 AND status IN ('OPEN','IN_REVIEW')",
            [id],
          )
        ).rowCount
      )
        throw new ConflictException('Human review is open. Continue in the case conversation.');
      if (!['ACTIVE', 'DISPUTED'].includes(p.status))
        throw new ConflictException('Pact is not open for execution.');
      const r = (
        await db.query(
          'SELECT * FROM resolutions WHERE id=$1 AND pact_id=$2 AND retired_at IS NULL',
          [rid, id],
        )
      ).rows[0];
      if (!r) throw new NotFoundException('Current resolution not found.');
      if (r.proposal.staffDecisionId)
        throw new ForbiddenException('Only the assigned reviewer can submit this outcome.');
      const parties = (await db.query('SELECT user_id FROM parties WHERE pact_id=$1', [id])).rows;
      const approvals = (await db.query('SELECT * FROM approvals WHERE resolution_id=$1', [rid]))
        .rows;
      if (
        parties.length !== 2 ||
        approvals.length !== 2 ||
        !parties.every((p) =>
          approvals.some(
            (a) =>
              a.user_id === p.user_id &&
              a.decision === 'APPROVED' &&
              a.resolution_version === r.version &&
              a.proposal_sha256 === r.proposal.proposalSha256,
          ),
        )
      )
        throw new ForbiddenException('Both parties must approve this exact resolution.');
      const snapshot = (await evidenceSnapshot(db, id)).map((v) => v.id).sort();
      if (JSON.stringify(snapshot) !== JSON.stringify(r.proposal.evidenceVersionIds))
        throw new ConflictException('Evidence changed; obtain fresh approvals.');
      const tx = (await db.query('SELECT * FROM transactions WHERE pact_id=$1 FOR UPDATE', [id]))
        .rows[0];
      if (tx.state !== 'CAPTURED')
        throw new ConflictException('Payment is not a verified captured payment.');
      const existing = (
        await db.query('SELECT id,status FROM paypal_transactions WHERE resolution_id=$1', [rid])
      ).rows[0];
      if (existing) return existing;
      if (r.proposal.type === 'NO_ACTION') {
        await db.query(
          'UPDATE pacts SET status=$2,version=version+1,updated_at=now() WHERE id=$1',
          [id, p.status === 'DISPUTED' ? 'RESOLVED' : 'COMPLETED'],
        );
        await audit(db, id, user.id, 'RESOLUTION_CONFIRMED_NO_FINANCIAL_ACTION', {
          resolutionId: rid,
        });
        return { status: 'CONFIRMED' };
      }
      if (!this.paypal.enabled())
        throw new ServiceUnavailableException('PayPal Sandbox is unavailable.');
      const result = await db.query(
        "INSERT INTO paypal_transactions(transaction_id,request_id,operation,status,resolution_id,actor_id,amount_minor) VALUES($1,$2,'REFUND','QUEUED',$3,$4,$5) RETURNING id,status",
        [tx.id, randomUUID(), rid, user.id, r.proposal.amountMinor],
      );
      await audit(db, id, user.id, 'FINANCIAL_ACTION_APPROVED', {
        resolutionId: rid,
        operationId: result.rows[0].id,
      });
      await enqueue(db, 'PAYMENT', result.rows[0].id, `payment-${result.rows[0].id}`);
      return result.rows[0];
    });
  }
  async payment(id: string, user: Identity, operation: 'ORDER' | 'CAPTURE') {
    parse(idSchema, id);
    if (!this.paypal.enabled())
      throw new ServiceUnavailableException('PayPal Sandbox is not configured.');
    {
      const preflight = await this.db.transaction(async (db) => {
        const p = await member(db, id, user.id);
        const tx = (await db.query('SELECT * FROM transactions WHERE pact_id=$1', [id])).rows[0];
        if (p.role !== tx.payer_role)
          throw new ForbiddenException('Only the payer can authorize this payment.');
        const prior = (
          await db.query(
            'SELECT id,status,response FROM paypal_transactions WHERE transaction_id=$1 AND operation=$2',
            [tx.id, operation],
          )
        ).rows[0];
        if (prior && (operation === 'CAPTURE' || !tx.order_id)) return { prior };
        if (operation === 'ORDER' && !tx.order_id) return {};
        if (p.status !== 'ACTIVE' || !['CREATED', 'AUTHORIZED'].includes(tx.state))
          throw new ConflictException('Payment is not open for capture.');
        if (!tx.order_id) throw new ConflictException('Create and approve the PayPal order first.');
        return { orderId: tx.order_id as string, tx };
      });
      if (preflight.prior) return preflight.prior;
      let order;
      if (preflight.orderId) {
        try {
          order = await this.paypal.getOrder(preflight.orderId!);
        } catch (error) {
          if (error instanceof ProviderError)
            await this.db.transaction(async (db) => {
              await member(db, id, user.id);
              await audit(db, id, user.id, 'PAYMENT_PREFLIGHT_FAILED', {
                operation,
                orderId: preflight.orderId,
                ...error.diagnostic,
              });
            });
          if (error instanceof ProviderError && !error.uncertain && error.diagnostic.http === 404)
            throw new CheckoutUnavailableError(false, error.diagnostic);
          throw error;
        }
        validateCaptureOrder(order, preflight.tx!);
        if (operation === 'CAPTURE' && !['APPROVED', 'COMPLETED'].includes(order.status))
          throw new ConflictException('Approve the order at PayPal before requesting capture.');
      }
    }
    return this.db.transaction(async (db) => {
      const p = await member(db, id, user.id, true);
      if (p.status !== 'ACTIVE')
        throw new ConflictException('Both parties must accept the Pact before payment.');
      const tx = (await db.query('SELECT * FROM transactions WHERE pact_id=$1 FOR UPDATE', [id]))
        .rows[0];
      if (p.role !== tx.payer_role)
        throw new ForbiddenException('Only the payer can authorize this payment.');
      if (!['USD', 'EUR', 'GBP'].includes(tx.currency))
        throw new ConflictException('This currency is not enabled in the sandbox adapter.');
      if (operation === 'CAPTURE' && !tx.order_id)
        throw new ConflictException('Create and approve the PayPal order first.');
      const prior = (
        await db.query(
          'SELECT id,status,response FROM paypal_transactions WHERE transaction_id=$1 AND operation=$2',
          [tx.id, operation],
        )
      ).rows[0];
      if (prior) return prior;
      if (!['CREATED', 'AUTHORIZED'].includes(tx.state))
        throw new ConflictException('Payment has already been started or completed.');
      const result = await db.query(
        "INSERT INTO paypal_transactions(transaction_id,request_id,operation,status,actor_id,amount_minor) VALUES($1,$2,$3,'QUEUED',$4,$5) RETURNING id,status",
        [tx.id, randomUUID(), operation, user.id, tx.amount_minor],
      );
      await enqueue(db, 'PAYMENT', result.rows[0].id, `payment-${result.rows[0].id}`);
      await audit(db, id, user.id, 'PAYMENT_INITIATED', {
        operation,
        operationId: result.rows[0].id,
      });
      return result.rows[0];
    });
  }
  async operation(id: string, operationId: string, user: Identity) {
    parse(idSchema, id);
    parse(idSchema, operationId);
    return this.db.transaction(async (db) => {
      await member(db, id, user.id);
      const result = await db.query(
        'SELECT op.id,op.status,op.operation,op.response,op.failure_code FROM paypal_transactions op JOIN transactions tx ON tx.id=op.transaction_id WHERE op.id=$1 AND tx.pact_id=$2',
        [operationId, id],
      );
      if (!result.rowCount) throw new NotFoundException();
      const op = result.rows[0];
      const payer = (
        await db.query(
          'SELECT t.payer_role,r.role FROM transactions t JOIN parties r ON r.pact_id=t.pact_id WHERE t.pact_id=$1 AND r.user_id=$2',
          [id, user.id],
        )
      ).rows[0];
      if (payer.payer_role !== payer.role) delete op.response;
      return op;
    });
  }
}
