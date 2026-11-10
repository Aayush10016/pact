import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Req,
  UseGuards,
  Module,
  Injectable,
  Inject,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { idSchema } from '@pact/types';
import {
  AuthModule,
  AuthenticationGuard,
  type AuthRequest,
  type Identity,
} from '../auth/auth.module';
import { Database, audit, enqueue, member, notify } from '../database/database.module';
import { parse } from '../pacts/lifecycle.service';
import { evidenceSnapshot } from '../assessments/assessments.module';
import { proposalHash } from '../payments/resolution.service';
import { PayPalProvider } from '../payments/paypal.provider';
import { EvidenceModule } from '../evidence/evidence.module';
import { EvidenceStorage } from '../evidence/storage';
import { PaymentsModule } from '../payments/payments.module';
import { requireReviewer, reviewerSubjects } from '../payments/refund-authority';

const requestSchema = z
  .object({
    requestId: idSchema,
    kind: z.enum(['REFUND', 'RESOLUTION']),
    reason: z.string().trim().min(10).max(2000),
  })
  .strict();
const messageSchema = z
  .object({
    requestId: idSchema,
    body: z.string().trim().min(1).max(4000),
    audienceId: idSchema.optional(),
    evidenceVersionIds: z.array(idSchema).max(20).default([]),
  })
  .strict();
const decisionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    expectedEvidenceVersionIds: z.array(idSchema).max(50),
    type: z.enum(['NO_ACTION', 'FULL_REFUND', 'PARTIAL_REFUND']),
    percentage: z.number().int().min(1).max(99).optional(),
    reason: z.string().trim().min(20).max(4000),
    responseOverrideReason: z.string().trim().min(20).max(1000).optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if ((v.type === 'PARTIAL_REFUND') !== (v.percentage !== undefined))
      c.addIssue({ code: 'custom', message: 'Only partial refunds require a percentage.' });
  });
@Injectable()
export class SupportService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(PayPalProvider) readonly paypal: PayPalProvider,
    @Inject(EvidenceStorage) readonly storage: EvidenceStorage,
  ) {}
  async access(
    db: import('pg').PoolClient,
    cid: string,
    actor: Identity,
    staff = false,
    lock = false,
  ) {
    parse(idSchema, cid);
    const c = (
      await db.query(`SELECT * FROM support_cases WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`, [cid])
    ).rows[0];
    if (!c) throw new NotFoundException('Case not found.');
    if (staff) {
      requireReviewer(actor.subject);
      if (
        (
          await db.query('SELECT 1 FROM parties WHERE pact_id=$1 AND user_id=$2', [
            c.pact_id,
            actor.id,
          ])
        ).rowCount
      )
        throw new ForbiddenException(
          'A reviewer cannot review their own Pact. Another reviewer is required.',
        );
      if (c.assigned_to && c.assigned_to !== actor.id)
        throw new ForbiddenException('This case is assigned to another reviewer.');
    } else await member(db, c.pact_id, actor.id);
    return c;
  }
  async open(pid: string, actor: Identity, input: unknown) {
    parse(idSchema, pid);
    const v = parse(requestSchema, input);
    return this.db.transaction(async (db) => {
      const p = await member(db, pid, actor.id, true);
      const prior = (
        await db.query(
          'SELECT * FROM support_cases WHERE pact_id=$1 AND requester_id=$2 AND request_id=$3',
          [pid, actor.id, v.requestId],
        )
      ).rows[0];
      if (prior) {
        if (prior.kind !== v.kind || prior.reason !== v.reason)
          throw new ConflictException(
            'This request identifier was already used for different content.',
          );
        return prior;
      }
      if (!['ACTIVE', 'DISPUTED'].includes(p.status))
        throw new ConflictException('This Pact is closed for new review.');
      const active = (
        await db.query(
          "SELECT * FROM support_cases WHERE pact_id=$1 AND status IN ('OPEN','IN_REVIEW')",
          [pid],
        )
      ).rows[0];
      if (active)
        throw new ConflictException(
          'A review is already open. Refresh and continue that conversation.',
        );
      if (
        (
          await db.query(
            "SELECT 1 FROM paypal_transactions op JOIN transactions t ON t.id=op.transaction_id WHERE t.pact_id=$1 AND op.status IN ('EXECUTING','PROVIDER_ACCEPTED','NEEDS_RECONCILIATION')",
            [pid],
          )
        ).rowCount
      )
        throw new ConflictException(
          'Payment confirmation is pending. Refresh the payment record before opening review.',
        );
      const tx = (await db.query('SELECT * FROM transactions WHERE pact_id=$1', [pid])).rows[0];
      if (v.kind === 'REFUND' && (p.role !== tx.payer_role || tx.state !== 'CAPTURED'))
        throw new ForbiddenException(
          'Only the payer of a confirmed captured payment can request refund review.',
        );
      await db.query(
        "UPDATE paypal_transactions SET status='CANCELLED' WHERE transaction_id=$1 AND operation='REFUND' AND status='QUEUED'",
        [tx.id],
      );
      const c = (
        await db.query(
          'INSERT INTO support_cases(pact_id,requester_id,request_id,kind,reason) VALUES($1,$2,$3,$4,$5) RETURNING *',
          [pid, actor.id, v.requestId, v.kind, v.reason],
        )
      ).rows[0];
      await db.query(
        "UPDATE pacts SET status='DISPUTED',version=version+1,updated_at=now() WHERE id=$1",
        [pid],
      );
      await audit(db, pid, actor.id, 'HUMAN_REVIEW_REQUESTED', { caseId: c.id, reason: v.reason });
      await notify(db, pid, 'HUMAN_REVIEW_REQUESTED');
      return c;
    });
  }
  async availability(pid: string, actor: Identity) {
    parse(idSchema, pid);
    return this.db.transaction(async (db) => {
      await member(db, pid, actor.id);
      const available = (
        await db.query(
          'SELECT 1 FROM users u WHERE u.auth_subject=ANY($1::text[]) AND NOT EXISTS(SELECT 1 FROM parties p WHERE p.pact_id=$2 AND p.user_id=u.id) LIMIT 1',
          [reviewerSubjects(), pid],
        )
      ).rowCount;
      return { configured: !!available };
    });
  }
  async cases(pid: string, actor: Identity) {
    parse(idSchema, pid);
    return this.db.transaction(async (db) => {
      await member(db, pid, actor.id);
      return (
        await db.query(
          'SELECT c.*,u.display_name reviewer_name FROM support_cases c LEFT JOIN users u ON u.id=c.assigned_to WHERE c.pact_id=$1 ORDER BY c.created_at DESC',
          [pid],
        )
      ).rows;
    });
  }
  async inbox(actor: Identity) {
    requireReviewer(actor.subject);
    return (
      await this.db.query(
        `SELECT c.*,p.title FROM support_cases c JOIN pacts p ON p.id=c.pact_id WHERE (c.assigned_to IS NULL OR c.assigned_to=$1) AND NOT EXISTS(SELECT 1 FROM parties x WHERE x.pact_id=c.pact_id AND x.user_id=$1) ORDER BY c.created_at DESC LIMIT 100`,
        [actor.id],
      )
    ).rows;
  }
  async claim(cid: string, actor: Identity) {
    return this.db.transaction(async (db) => {
      const c = await this.access(db, cid, actor, true, true);
      if (c.status === 'DECIDED') throw new ConflictException('Case already decided.');
      if (c.assigned_to === actor.id) return c;
      const next = (
        await db.query(
          "UPDATE support_cases SET assigned_to=$2,status='IN_REVIEW',version=version+1,response_deadline=now()+interval '72 hours' WHERE id=$1 RETURNING *",
          [cid, actor.id],
        )
      ).rows[0];
      await audit(db, c.pact_id, actor.id, 'HUMAN_REVIEW_ASSIGNED', { caseId: cid });
      await notify(db, c.pact_id, 'HUMAN_REVIEW_ASSIGNED');
      return next;
    });
  }
  async read(cid: string, actor: Identity, staff = false) {
    return this.db.transaction(async (db) => {
      const c = await this.access(db, cid, actor, staff);
      const parties = (
        await db.query(
          'SELECT p.user_id,p.role,u.display_name FROM parties p JOIN users u ON u.id=p.user_id WHERE p.pact_id=$1',
          [c.pact_id],
        )
      ).rows;
      const tx = (
        await db.query(
          'SELECT state,amount_minor,refunded_minor,currency,payer_role FROM transactions WHERE pact_id=$1',
          [c.pact_id],
        )
      ).rows[0];
      const messages = (
        await db.query(
          `SELECT m.*,u.display_name sender_name FROM support_messages m JOIN users u ON u.id=m.sender_id WHERE m.case_id=$1 ${staff ? '' : 'AND (m.sender_id=$2 OR m.audience_id=$2)'} ORDER BY m.created_at,m.id`,
          staff ? [cid] : [cid, actor.id],
        )
      ).rows;
      const decision =
        (
          await db.query(
            'SELECT d.reason,d.response_override_reason,d.created_at,r.proposal FROM support_decisions d JOIN resolutions r ON r.id=d.resolution_id WHERE d.case_id=$1',
            [cid],
          )
        ).rows[0] ?? null;
      const evidence = staff ? await evidenceSnapshot(db, c.pact_id) : [];
      const pact = staff
        ? (await db.query('SELECT title,agreement FROM pacts WHERE id=$1', [c.pact_id])).rows[0]
        : null;
      if (pact)
        pact.commitments = (
          await db.query(
            'SELECT title,description,acceptance_criteria,expected_evidence FROM commitments WHERE pact_id=$1 ORDER BY position',
            [c.pact_id],
          )
        ).rows;
      const reviewer =
        (await db.query('SELECT display_name FROM users WHERE id=$1', [c.assigned_to])).rows[0]
          ?.display_name ?? null;
      return {
        ...c,
        parties,
        transaction: tx,
        messages,
        decision,
        evidence,
        reviewer_name: reviewer,
        ...(staff ? { pact } : {}),
      };
    });
  }
  async message(cid: string, actor: Identity, input: unknown, staff = false) {
    const v = parse(messageSchema, input);
    return this.db.transaction(async (db) => {
      const reference = await this.access(db, cid, actor, staff);
      await db.query('SELECT id FROM pacts WHERE id=$1 FOR UPDATE', [reference.pact_id]);
      const c = await this.access(db, cid, actor, staff, true);
      const prior = (
        await db.query(
          'SELECT * FROM support_messages WHERE case_id=$1 AND sender_id=$2 AND request_id=$3',
          [cid, actor.id, v.requestId],
        )
      ).rows[0];
      const audience = staff ? v.audienceId : actor.id;
      if (!audience) throw new ForbiddenException('Choose which party to contact.');
      if (prior) {
        if (
          prior.body !== v.body ||
          prior.audience_id !== audience ||
          JSON.stringify(prior.evidence_version_ids) !== JSON.stringify(v.evidenceVersionIds)
        )
          throw new ConflictException('Request identifier content changed.');
        return prior;
      }
      if (c.status === 'DECIDED') throw new ConflictException('Case already decided.');
      if (staff && c.assigned_to !== actor.id)
        throw new ForbiddenException('Claim the case before messaging.');
      if (!staff && v.audienceId)
        throw new ForbiddenException('Party messages are private to the reviewer.');
      if (
        !(
          await db.query('SELECT 1 FROM parties WHERE pact_id=$1 AND user_id=$2', [
            c.pact_id,
            audience,
          ])
        ).rowCount
      )
        throw new ForbiddenException('Audience is not a Pact member.');
      if (
        v.evidenceVersionIds.length &&
        (
          await db.query(
            "SELECT v.id FROM evidence_versions v JOIN evidence e ON e.id=v.evidence_id WHERE e.pact_id=$1 AND v.id=ANY($2::uuid[]) AND v.state='READY' AND v.scan_state='CLEAN'",
            [c.pact_id, v.evidenceVersionIds],
          )
        ).rowCount !== v.evidenceVersionIds.length
      )
        throw new ForbiddenException('Evidence must be processed and belong to this Pact.');
      const m = (
        await db.query(
          'INSERT INTO support_messages(case_id,sender_id,audience_id,request_id,body,evidence_version_ids) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
          [cid, actor.id, audience, v.requestId, v.body, v.evidenceVersionIds],
        )
      ).rows[0];
      await db.query('UPDATE support_cases SET version=version+1 WHERE id=$1', [cid]);
      await audit(db, c.pact_id, actor.id, 'HUMAN_REVIEW_MESSAGE', {
        caseId: cid,
        messageId: m.id,
      });
      await notify(db, c.pact_id, 'HUMAN_REVIEW_MESSAGE');
      return m;
    });
  }
  async download(cid: string, vid: string, actor: Identity) {
    parse(idSchema, vid);
    const key = await this.db.transaction(async (db) => {
      const c = await this.access(db, cid, actor, true);
      if (c.assigned_to !== actor.id)
        throw new ForbiddenException('Claim this case before accessing original evidence.');
      const v = (
        await db.query(
          "SELECT v.object_key FROM evidence_versions v JOIN evidence e ON e.id=v.evidence_id WHERE v.id=$1 AND e.pact_id=$2 AND v.scan_state='CLEAN' AND v.state='READY' AND v.purged_at IS NULL",
          [vid, c.pact_id],
        )
      ).rows[0];
      if (!v) throw new NotFoundException('Processed evidence unavailable.');
      await audit(db, c.pact_id, actor.id, 'HUMAN_REVIEW_EVIDENCE_READ', {
        caseId: cid,
        versionId: vid,
      });
      return v.object_key as string;
    });
    return { url: await this.storage.download(key), expiresIn: 120 };
  }
  async decide(cid: string, actor: Identity, input: unknown) {
    const v = parse(decisionSchema, input);
    return this.db.transaction(async (db) => {
      const ref = await this.access(db, cid, actor, true);
      const p = (await db.query('SELECT * FROM pacts WHERE id=$1 FOR UPDATE', [ref.pact_id]))
        .rows[0];
      const c = await this.access(db, cid, actor, true, true);
      if (c.assigned_to !== actor.id || c.status !== 'IN_REVIEW')
        throw new ForbiddenException('Claim an open case before deciding.');
      if (c.version !== v.expectedVersion)
        throw new ConflictException('Conversation changed. Read both sides again before deciding.');
      if (!['ACTIVE', 'DISPUTED'].includes(p.status))
        throw new ConflictException('Pact already settled.');
      const parties = (await db.query('SELECT user_id FROM parties WHERE pact_id=$1', [p.id])).rows;
      if (parties.length !== 2) throw new ConflictException('Two parties required.');
      for (const party of parties) {
        const contacted = (
          await db.query(
            'SELECT 1 FROM support_messages WHERE case_id=$1 AND sender_id=$2 AND audience_id=$3',
            [cid, actor.id, party.user_id],
          )
        ).rowCount;
        if (!contacted) throw new ConflictException('Contact both parties before deciding.');
        const responded = (
          await db.query('SELECT 1 FROM support_messages WHERE case_id=$1 AND sender_id=$2', [
            cid,
            party.user_id,
          ])
        ).rowCount;
        if (
          !responded &&
          (Date.now() < new Date(c.response_deadline).getTime() || !v.responseOverrideReason)
        )
          throw new ConflictException(
            'Await both responses, or the 72-hour deadline and a documented nonresponse explanation.',
          );
      }
      const tx = (await db.query('SELECT * FROM transactions WHERE pact_id=$1 FOR UPDATE', [p.id]))
        .rows[0];
      if (
        (
          await db.query(
            "SELECT 1 FROM paypal_transactions WHERE transaction_id=$1 AND operation='REFUND' AND status IN ('QUEUED','EXECUTING','PROVIDER_ACCEPTED','NEEDS_RECONCILIATION','CONFIRMED')",
            [tx.id],
          )
        ).rowCount
      )
        throw new ConflictException('A refund is already in flight or settled.');
      const amount =
        v.type === 'FULL_REFUND'
          ? BigInt(tx.amount_minor) - BigInt(tx.refunded_minor)
          : v.type === 'PARTIAL_REFUND'
            ? (BigInt(tx.amount_minor) * BigInt(v.percentage!)) / 100n
            : 0n;
      if (
        v.type !== 'NO_ACTION' &&
        (tx.state !== 'CAPTURED' ||
          !tx.capture_id ||
          amount <= 0n ||
          amount > BigInt(tx.amount_minor) - BigInt(tx.refunded_minor))
      )
        throw new ConflictException('A confirmed capture with available funds is required.');
      if (
        v.type !== 'NO_ACTION' &&
        (!this.paypal.enabled() || process.env.WORKERS_ENABLED !== 'true')
      )
        throw new ServiceUnavailableException(
          'Refund processing is unavailable. No decision was submitted.',
        );
      const snapshot = (await evidenceSnapshot(db, p.id)).map((e) => e.id).sort();
      if (JSON.stringify(snapshot) !== JSON.stringify([...v.expectedEvidenceVersionIds].sort()))
        throw new ConflictException(
          'Evidence changed since review. Refresh and inspect the new evidence before deciding.',
        );
      const did = randomUUID();
      const proposal = {
        type: v.type,
        ...(v.percentage ? { percentage: v.percentage } : {}),
        reason: v.reason,
        amountMinor: amount.toString(),
        currency: tx.currency,
        evidenceVersionIds: snapshot,
        staffDecisionId: did,
      };
      const hash = proposalHash(proposal);
      const version =
        (
          await db.query(
            'SELECT COALESCE(max(version),0)::int n FROM resolutions WHERE pact_id=$1',
            [p.id],
          )
        ).rows[0].n + 1;
      await db.query(
        'UPDATE resolutions SET retired_at=now() WHERE pact_id=$1 AND retired_at IS NULL',
        [p.id],
      );
      const resolution = (
        await db.query(
          'INSERT INTO resolutions(pact_id,proposal,version) VALUES($1,$2,$3) RETURNING id',
          [p.id, JSON.stringify({ ...proposal, proposalSha256: hash }), version],
        )
      ).rows[0];
      await db.query(
        'INSERT INTO support_decisions(id,case_id,reviewer_id,resolution_id,case_version,resolution_version,proposal_sha256,reason,evidence_version_ids,response_override_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          did,
          cid,
          actor.id,
          resolution.id,
          c.version,
          version,
          hash,
          v.reason,
          snapshot,
          v.responseOverrideReason ?? null,
        ],
      );
      await db.query("UPDATE support_cases SET status='DECIDED',version=version+1 WHERE id=$1", [
        cid,
      ]);
      let operation = null;
      if (v.type === 'NO_ACTION') {
        await db.query(
          "UPDATE pacts SET status='RESOLVED',version=version+1,updated_at=now() WHERE id=$1",
          [p.id],
        );
      } else {
        operation = (
          await db.query(
            "INSERT INTO paypal_transactions(transaction_id,request_id,operation,status,resolution_id,actor_id,amount_minor) VALUES($1,$2,'REFUND','QUEUED',$3,$4,$5) RETURNING id,status",
            [tx.id, randomUUID(), resolution.id, actor.id, amount.toString()],
          )
        ).rows[0];
        await enqueue(db, 'PAYMENT', operation.id, `payment-${operation.id}`);
      }
      await audit(db, p.id, actor.id, 'HUMAN_REVIEW_DECIDED', {
        caseId: cid,
        decisionId: did,
        resolutionId: resolution.id,
        type: v.type,
        reason: v.reason,
      });
      await notify(db, p.id, 'HUMAN_REVIEW_DECIDED');
      return { decisionId: did, operation };
    });
  }
}
@Controller('v1')
@UseGuards(AuthenticationGuard)
class SupportController {
  constructor(@Inject(SupportService) readonly service: SupportService) {}
  @Get('me/reviewer') reviewer(@Req() r: AuthRequest) {
    return {
      data: {
        enabled: reviewerSubjects().includes(r.identity.subject),
        configured: reviewerSubjects().length > 0,
      },
    };
  }
  @Get('pacts/:pid/support/availability') async availability(
    @Param('pid') p: string,
    @Req() r: AuthRequest,
  ) {
    return { data: await this.service.availability(p, r.identity) };
  }
  @Get('pacts/:pid/support') async cases(@Param('pid') p: string, @Req() r: AuthRequest) {
    return { data: await this.service.cases(p, r.identity) };
  }
  @Post('pacts/:pid/support') async open(
    @Param('pid') p: string,
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return { data: await this.service.open(p, r.identity, b) };
  }
  @Get('support/:cid') async read(@Param('cid') c: string, @Req() r: AuthRequest) {
    return { data: await this.service.read(c, r.identity) };
  }
  @Post('support/:cid/messages') async message(
    @Param('cid') c: string,
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return { data: await this.service.message(c, r.identity, b) };
  }
  @Get('staff/cases') async inbox(@Req() r: AuthRequest) {
    return { data: await this.service.inbox(r.identity) };
  }
  @Get('staff/cases/:cid') async detail(@Param('cid') c: string, @Req() r: AuthRequest) {
    return { data: await this.service.read(c, r.identity, true) };
  }
  @Post('staff/cases/:cid/claim') async claim(@Param('cid') c: string, @Req() r: AuthRequest) {
    return { data: await this.service.claim(c, r.identity) };
  }
  @Post('staff/cases/:cid/messages') async send(
    @Param('cid') c: string,
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return { data: await this.service.message(c, r.identity, b, true) };
  }
  @Get('staff/cases/:cid/evidence/:vid/download') async download(
    @Param('cid') cid: string,
    @Param('vid') vid: string,
    @Req() r: AuthRequest,
  ) {
    return { data: await this.service.download(cid, vid, r.identity) };
  }
  @Post('staff/cases/:cid/decision') async decide(
    @Param('cid') c: string,
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return { data: await this.service.decide(c, r.identity, b) };
  }
}
@Module({
  imports: [AuthModule, PaymentsModule, EvidenceModule],
  controllers: [SupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
