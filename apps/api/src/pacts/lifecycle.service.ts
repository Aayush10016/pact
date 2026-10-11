import {
  Inject,
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createPactSchema, commitmentInputSchema, idSchema } from '@pact/types';
import { Database, member, audit } from '../database/database.module';
import type { Identity } from '../auth/auth.module';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { activityLabel } from '../payments/activity-label';
type ActivityContext = {
  id: string;
  pact_id: string;
  title: string;
  event_type: string;
  created_at: Date;
  operation: string | null;
  decision: string | null;
  reason: string | null;
  actor_name: string | null;
  provider_event: string | null;
  receipt_id: string | null;
  receipt_operation: string | null;
  amount_minor: string;
  currency: string;
  transaction_id: string;
};
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException('Check the request fields.');
  return result.data;
}
export const transitions: Record<string, readonly string[]> = {
  CREATED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED', 'DISPUTED', 'CANCELLED'],
  DISPUTED: ['RESOLVED'],
  COMPLETED: [],
  RESOLVED: [],
  CANCELLED: [],
};
@Injectable()
export class LifecycleService {
  constructor(@Inject(Database) readonly db: Database) {}
  async create(user: Identity, value: unknown, key: unknown) {
    const data = parse(createPactSchema, value);
    const requestId = parse(idSchema, key);
    if (data.counterpartyEmail === user.email)
      throw new BadRequestException('The other party must be a different person.');
    if (data.deadline && Date.parse(data.deadline) < Date.now())
      throw new BadRequestException('Deadline must not be in the past.');
    const sha = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    return this.db.transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [user.id + requestId]);
      const existing = await db.query(
        'SELECT id,request_sha256 FROM pacts WHERE created_by=$1 AND client_request_id=$2',
        [user.id, requestId],
      );
      if (existing.rowCount) {
        if (existing.rows[0].request_sha256 !== sha)
          throw new ConflictException('This request key was already used for different content.');
        return { id: existing.rows[0].id };
      }
      const pact = await db.query(
        'INSERT INTO pacts(title,agreement,deadline,payment_condition,created_by,client_request_id,request_sha256) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [
          data.title,
          data.agreement,
          data.deadline ?? null,
          data.paymentCondition,
          user.id,
          requestId,
          sha,
        ],
      );
      const id = pact.rows[0].id;
      await db.query("INSERT INTO parties(pact_id,user_id,role) VALUES($1,$2,'PARTY_A')", [
        id,
        user.id,
      ]);
      await db.query('INSERT INTO pact_invitations(pact_id,email) VALUES($1,$2)', [
        id,
        data.counterpartyEmail,
      ]);
      await db.query(
        'INSERT INTO transactions(pact_id,amount_minor,currency,payer_role) VALUES($1,$2,$3,$4)',
        [id, data.money.amountMinor, data.money.currency, data.payerRole],
      );
      await audit(db, id, user.id, 'PACT_CREATED');
      for (let i = 0; i < data.commitments.length; i++)
        await this.insertCommitment(db, id, user.id, data.commitments[i]!, i);
      return { id };
    });
  }
  async insertCommitment(
    db: PoolClient,
    id: string,
    userId: string,
    data: z.infer<typeof commitmentInputSchema>,
    position: number,
  ) {
    const c = await db.query(
      'INSERT INTO commitments(pact_id,title,description,acceptance_criteria,expected_evidence,deadline,promised_by,position) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [
        id,
        data.title,
        data.description,
        data.acceptanceCriteria,
        data.expectedEvidence,
        data.dueAt ?? null,
        userId,
        position,
      ],
    );
    await audit(db, id, userId, 'COMMITMENT_CREATED', { commitmentId: c.rows[0].id });
    for (let i = 0; i < data.milestones.length; i++) {
      const m = data.milestones[i]!;
      const result = await db.query(
        'INSERT INTO milestones(commitment_id,title,position,deadline) VALUES($1,$2,$3,$4) RETURNING id',
        [c.rows[0].id, m.title, i, m.dueAt ?? null],
      );
      await audit(db, id, userId, 'MILESTONE_CREATED', { milestoneId: result.rows[0].id });
    }
    return c.rows[0];
  }
  async invitation(id: string, user: Identity) {
    parse(idSchema, id);
    const invitation = (
      await this.db.query(
        "SELECT i.pact_id,p.title,p.agreement,p.payment_condition,t.amount_minor,t.currency,t.payer_role FROM pact_invitations i JOIN pacts p ON p.id=i.pact_id JOIN transactions t ON t.pact_id=p.id WHERE i.id=$1 AND lower(i.email)=$2 AND i.accepted_at IS NULL AND p.status='CREATED'",
        [id, user.email],
      )
    ).rows[0];
    if (!invitation) throw new ForbiddenException('Invitation unavailable.');
    invitation.commitments = (
      await this.db.query(
        'SELECT id,title,description,acceptance_criteria,expected_evidence FROM commitments WHERE pact_id=$1 ORDER BY position',
        [invitation.pact_id],
      )
    ).rows;
    return invitation;
  }
  async list(user: Identity) {
    return (
      await this.db.query(
        'SELECT p.id,p.title,p.status,p.deadline,p.created_at,t.amount_minor,t.currency,t.state AS payment_state,(SELECT display_name FROM parties other JOIN users u ON u.id=other.user_id WHERE other.pact_id=p.id AND other.user_id<>$1 LIMIT 1) AS other_party FROM pacts p JOIN parties r ON r.pact_id=p.id JOIN transactions t ON t.pact_id=p.id WHERE r.user_id=$1 ORDER BY p.created_at DESC LIMIT 100',
        [user.id],
      )
    ).rows;
  }
  async detail(id: string, user: Identity) {
    parse(idSchema, id);
    return this.db.transaction(async (db) => {
      const p = await member(db, id, user.id);
      const parties = (
        await db.query(
          'SELECT r.user_id,r.role,u.display_name,u.email FROM parties r JOIN users u ON u.id=r.user_id WHERE pact_id=$1 ORDER BY role',
          [id],
        )
      ).rows;
      const transaction = (
        await db.query(
          'SELECT id,amount_minor,currency,state,payer_role,refunded_minor,order_id,capture_id FROM transactions WHERE pact_id=$1',
          [id],
        )
      ).rows[0];
      transaction.confirmation_pending = !!(
        await db.query(
          "SELECT 1 FROM paypal_transactions WHERE transaction_id=$1 AND operation IN ('CAPTURE','REFUND') AND status IN ('QUEUED','EXECUTING','PROVIDER_ACCEPTED','NEEDS_RECONCILIATION')",
          [transaction.id],
        )
      ).rowCount;
      const commitments = (
        await db.query(
          "SELECT c.*,COALESCE((SELECT jsonb_agg(m ORDER BY m.position) FROM milestones m WHERE m.commitment_id=c.id),'[]') AS milestones FROM commitments c WHERE c.pact_id=$1 ORDER BY c.position",
          [id],
        )
      ).rows;
      const evidence = (
        await db.query(
          "SELECT e.id,e.title,e.commitment_id,e.uploaded_by,e.occurred_at,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'version',v.version,'state',v.state,'mime_type',v.mime_type,'size_bytes',v.size_bytes::text,'created_at',v.created_at,'failure_code',v.failure_code) ORDER BY v.version) FROM evidence_versions v WHERE v.evidence_id=e.id),'[]') AS versions FROM evidence e WHERE e.pact_id=$1 ORDER BY e.occurred_at",
          [id],
        )
      ).rows;
      const analyses = (
        await db.query(
          'SELECT id,state,assessment,failure_code,created_at FROM ai_analyses WHERE pact_id=$1 ORDER BY created_at DESC LIMIT 20',
          [id],
        )
      ).rows;
      const resolutions = (
        await db.query(
          "SELECT r.id,r.version,r.proposal,r.retired_at,COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id',a.user_id,'decision',a.decision)) FROM approvals a WHERE a.resolution_id=r.id),'[]') AS approvals,(SELECT jsonb_build_object('status',pt.status) FROM paypal_transactions pt WHERE pt.resolution_id=r.id) AS execution FROM resolutions r WHERE r.pact_id=$1 ORDER BY version DESC",
          [id],
        )
      ).rows;
      const supportCase =
        (
          await db.query(
            'SELECT id,status FROM support_cases WHERE pact_id=$1 ORDER BY created_at DESC LIMIT 1',
            [id],
          )
        ).rows[0] ?? null;
      const history = await this.activity(user, id, db);
      return {
        ...p,
        parties,
        transaction,
        commitments,
        evidence,
        analyses,
        resolutions,
        audit: history,
        supportCase,
      };
    });
  }
  async accept(invitationId: string, user: Identity) {
    parse(idSchema, invitationId);
    return this.db.transaction(async (db) => {
      const r = await db.query(
        'SELECT i.*,p.status FROM pact_invitations i JOIN pacts p ON p.id=i.pact_id WHERE i.id=$1 AND lower(i.email)=$2 FOR UPDATE OF p,i',
        [invitationId, user.email],
      );
      if (!r.rowCount)
        throw new ForbiddenException('Invitation is not available to this identity.');
      const invite = r.rows[0];
      if (invite.accepted_by === user.id) return { id: invite.pact_id };
      if (invite.status !== 'CREATED' || invite.accepted_at)
        throw new ConflictException('Invitation is no longer active.');
      await db.query("INSERT INTO parties(pact_id,user_id,role) VALUES($1,$2,'PARTY_B')", [
        invite.pact_id,
        user.id,
      ]);
      await db.query('UPDATE pact_invitations SET accepted_by=$1,accepted_at=now() WHERE id=$2', [
        user.id,
        invitationId,
      ]);
      await db.query(
        "UPDATE pacts SET status='ACTIVE',version=version+1,updated_at=now() WHERE id=$1",
        [invite.pact_id],
      );
      await audit(db, invite.pact_id, user.id, 'PACT_ACTIVATED');
      return { id: invite.pact_id };
    });
  }
  async addCommitment(id: string, user: Identity, value: unknown) {
    parse(idSchema, id);
    const data = parse(commitmentInputSchema, value);
    return this.db.transaction(async (db) => {
      const p = await member(db, id, user.id, true);
      if (p.status !== 'CREATED') throw new ConflictException('This agreement cannot be edited.');
      const count = await db.query('SELECT count(*)::int AS n FROM commitments WHERE pact_id=$1', [
        id,
      ]);
      if (count.rows[0].n >= 20) throw new ConflictException('Commitment limit reached.');
      return this.insertCommitment(db, id, user.id, data, count.rows[0].n);
    });
  }
  async milestone(id: string, milestoneId: string, user: Identity) {
    parse(idSchema, id);
    parse(idSchema, milestoneId);
    return this.db.transaction(async (db) => {
      const p = await member(db, id, user.id, true);
      if (p.status !== 'ACTIVE') throw new ConflictException('Pact must be active.');
      const r = await db.query(
        'SELECT m.id FROM milestones m JOIN commitments c ON c.id=m.commitment_id WHERE m.id=$1 AND c.pact_id=$2 AND c.promised_by=$3',
        [milestoneId, id, user.id],
      );
      if (!r.rowCount)
        throw new ForbiddenException('Only the promising party can record this delivery.');
      await db.query("UPDATE milestones SET status='DELIVERED',updated_at=now() WHERE id=$1", [
        milestoneId,
      ]);
      await audit(db, id, user.id, 'MILESTONE_DELIVERED', { milestoneId });
      return { id: milestoneId };
    });
  }
  async transition(id: string, user: Identity, value: unknown) {
    parse(idSchema, id);
    const data = parse(
      z
        .object({
          status: z.enum(['DISPUTED', 'CANCELLED']),
          expectedVersion: z.number().int().positive(),
          reason: z.string().trim().min(10).max(2000).optional(),
        })
        .strict()
        .refine((v) => v.status !== 'DISPUTED' || !!v.reason),
      value,
    );
    return this.db.transaction(async (db) => {
      const p = await member(db, id, user.id, true);
      if (p.version !== data.expectedVersion)
        throw new ConflictException('Pact changed. Refresh before acting.');
      if (
        !transitions[p.status]?.includes(data.status) &&
        !(p.status === 'DISPUTED' && data.status === 'DISPUTED')
      )
        throw new ConflictException('Invalid Pact transition.');
      const payment = await db.query('SELECT state FROM transactions WHERE pact_id=$1', [id]);
      if (
        data.status === 'CANCELLED' &&
        (payment.rows[0].state !== 'CREATED' ||
          (
            await db.query(
              "SELECT 1 FROM paypal_transactions op JOIN transactions tx ON tx.id=op.transaction_id WHERE tx.pact_id=$1 AND op.status NOT IN ('FAILED','CANCELLED')",
              [id],
            )
          ).rowCount)
      )
        throw new ConflictException('A started payment requires a resolution.');
      await db.query('UPDATE pacts SET status=$2,version=version+1,updated_at=now() WHERE id=$1', [
        id,
        data.status,
      ]);
      await audit(
        db,
        id,
        user.id,
        p.status === 'DISPUTED' ? 'PACT_RESOLUTION_CONCERN' : `PACT_${data.status}`,
        data.reason ? { reason: data.reason } : {},
      );
      return { status: data.status };
    });
  }
  async activity(user: Identity, pactId: string | null = null, client?: PoolClient) {
    const query = (sql: string, values: (string | null)[]) =>
      client
        ? client.query<ActivityContext>(sql, values)
        : this.db.query<ActivityContext>(sql, values);
    const rows = (
      await query(
        `SELECT a.id,a.pact_id,a.event_type,a.created_at,p.title,
          CASE WHEN a.event_type IN ('PACT_DISPUTED','PACT_RESOLUTION_CONCERN','HUMAN_REVIEW_REQUESTED','HUMAN_REVIEW_DECIDED') THEN a.metadata->>'reason' END reason,
          CASE WHEN a.event_type IN ('PACT_DISPUTED','PACT_RESOLUTION_CONCERN','HUMAN_REVIEW_REQUESTED','HUMAN_REVIEW_DECIDED') THEN actor.display_name END actor_name,
          COALESCE(op.operation,CASE WHEN res.proposal->>'type' IN ('FULL_REFUND','PARTIAL_REFUND') THEN 'REFUND' END) operation,
          a.metadata->>'decision' decision,
          COALESCE(a.metadata->>'providerEventType',we.event_type) provider_event,
          final.id receipt_id,final.operation receipt_operation,final.amount_minor,tx.currency,tx.id transaction_id
          FROM audit_events a JOIN pacts p ON p.id=a.pact_id JOIN parties r ON r.pact_id=p.id
          LEFT JOIN users actor ON actor.id=a.actor_id
          LEFT JOIN paypal_transactions op ON op.id::text=a.metadata->>'operationId'
            AND EXISTS(SELECT 1 FROM transactions ot WHERE ot.id=op.transaction_id AND ot.pact_id=a.pact_id)
          LEFT JOIN resolutions res ON res.id::text=a.metadata->>'resolutionId' AND res.pact_id=a.pact_id
          LEFT JOIN transactions tx ON tx.pact_id=a.pact_id
          LEFT JOIN LATERAL (SELECT w.event_type FROM audit_events received JOIN paypal_webhook_events w
            ON w.provider_event_id=received.metadata->>'paypalEventId'
            WHERE received.pact_id=a.pact_id AND received.event_type='PAYPAL_WEBHOOK_RECEIVED'
            AND (received.id=a.id OR received.created_at=a.created_at)
            ORDER BY received.created_at DESC LIMIT 1) we ON true
          LEFT JOIN paypal_transactions final ON final.transaction_id=tx.id AND final.status='CONFIRMED'
            AND tx.order_id IS NOT NULL AND tx.capture_id IS NOT NULL
            AND ((a.event_type='PAYMENT_CAPTURED' AND final.operation='CAPTURE' AND a.metadata->>'transactionId'=tx.id::text)
              OR (a.event_type='FINANCIAL_ACTION_EXECUTED' AND final.operation='REFUND' AND a.metadata->>'operationId'=final.id::text AND final.paypal_id IS NOT NULL)
              OR (a.event_type='PAYPAL_OPERATION_RECONCILED' AND a.metadata->>'operationId'=final.id::text
                AND final.operation IN ('CAPTURE','REFUND') AND final.paypal_id IS NOT NULL))
          WHERE r.user_id=$1 AND ($2::uuid IS NULL OR p.id=$2) ORDER BY a.created_at DESC,a.id DESC LIMIT 100`,
        [user.id, pactId],
      )
    ).rows;
    return rows.map((a) => ({
      id: a.id,
      pact_id: a.pact_id,
      title: a.title,
      event_type: a.event_type,
      created_at: a.created_at,
      label: activityLabel(a.event_type, a.operation, a.provider_event, a.decision),
      ...(a.reason ? { reason: a.reason } : {}),
      ...(a.actor_name ? { actorName: a.actor_name } : {}),
      receipt: a.receipt_id
        ? {
            id: a.receipt_operation === 'CAPTURE' ? a.transaction_id : a.receipt_id,
            kind: a.receipt_operation === 'CAPTURE' ? 'payment' : 'refund',
            amountMinor: a.amount_minor,
            currency: a.currency,
          }
        : null,
    }));
  }
}
