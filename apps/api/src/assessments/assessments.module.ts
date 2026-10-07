import {
  Module,
  Controller,
  Post,
  Param,
  Req,
  Body,
  UseGuards,
  Inject,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { idSchema } from '@pact/types';
import { AuthModule, AuthenticationGuard, type AuthRequest } from '../auth/auth.module';
import { Database, member, audit, enqueue } from '../database/database.module';
import { parse } from '../pacts/lifecycle.service';
export async function evidenceSnapshot(db: { query: Database['query'] }, pactId: string) {
  return (
    await db.query(
      "SELECT DISTINCT ON(e.id) v.id,CASE WHEN v.scan_state='CLEAN' AND v.purged_at IS NULL THEN v.state ELSE 'FAILED' END AS state,v.extracted_text,e.commitment_id FROM evidence e JOIN evidence_versions v ON v.evidence_id=e.id WHERE e.pact_id=$1 ORDER BY e.id,v.version DESC",
      [pactId],
    )
  ).rows;
}
@Controller('v1/pacts/:id/assessments')
@UseGuards(AuthenticationGuard)
export class AssessmentsController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Post() async request(@Param('id') id: string, @Req() req: AuthRequest, @Body() body: unknown) {
    parse(idSchema, id);
    const data = parse(z.object({ requestId: idSchema }).strict(), body);
    if (!process.env.AI_SERVICE_KEY || !process.env.AI_SERVICE_URL)
      throw new ServiceUnavailableException('Advisory assessment is not configured.');
    return {
      data: await this.db.transaction(async (db) => {
        const p = await member(db, id, req.identity.id, true);
        if (!['ACTIVE', 'DISPUTED'].includes(p.status))
          throw new ConflictException('Pact is not open for assessment.');
        const prior = await db.query(
          'SELECT id,state FROM ai_analyses WHERE pact_id=$1 AND request_id=$2',
          [id, data.requestId],
        );
        if (prior.rowCount) return prior.rows[0];
        const recent = await db.query(
          "SELECT count(*)::int AS n FROM audit_events WHERE actor_id=$1 AND event_type='ASSESSMENT_REQUESTED' AND created_at>now()-interval '1 hour'",
          [req.identity.id],
        );
        if (recent.rows[0].n >= 10)
          throw new ConflictException('Assessment budget reached. Try again later.');
        const running = await db.query(
          "SELECT 1 FROM ai_analyses WHERE pact_id=$1 AND state='PENDING'",
          [id],
        );
        if (running.rowCount) throw new ConflictException('An assessment is already queued.');
        const evidence = await evidenceSnapshot(db, id);
        const ready = evidence.filter((v) => v.state === 'READY' && v.extracted_text);
        if (!ready.length)
          throw new ConflictException('Add processed text evidence before requesting assessment.');
        const commitments = (
          await db.query(
            'SELECT id,title,description,acceptance_criteria,expected_evidence FROM commitments WHERE pact_id=$1 ORDER BY position',
            [id],
          )
        ).rows;
        const snapshot = {
          pactId: id,
          commitments: commitments.map((c) => ({
            id: c.id,
            description: `${c.title}: ${c.description}\nAcceptance criteria: ${c.acceptance_criteria}\nExpected evidence: ${c.expected_evidence}`,
          })),
          evidence: ready.map((v) => ({
            id: v.id,
            commitmentId: v.commitment_id,
            content: v.extracted_text.slice(0, 10000),
          })),
          unavailableEvidence: evidence.filter((v) => v.state !== 'READY').map((v) => v.id),
        };
        const r = await db.query(
          "INSERT INTO ai_analyses(pact_id,provider,model,schema_version,evidence_version_ids,assessment,request_id,input_snapshot,state) VALUES($1,'nvidia-nim','configured-at-execution',2,$2,'{}',$3,$4,'PENDING') RETURNING id,state",
          [id, evidence.map((v) => v.id), data.requestId, JSON.stringify(snapshot)],
        );
        await audit(db, id, req.identity.id, 'ASSESSMENT_REQUESTED', { analysisId: r.rows[0].id });
        await enqueue(db, 'ASSESSMENT', r.rows[0].id, `assessment-${r.rows[0].id}`);
        return r.rows[0];
      }),
    };
  }
}
@Module({ imports: [AuthModule], controllers: [AssessmentsController] })
export class AssessmentsModule {}
