import { ForbiddenException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { idSchema } from '@pact/types';

export function reviewerSubjects() {
  return (process.env.PACT_REVIEWER_SUBJECTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
export function requireReviewer(subject: string) {
  if (!reviewerSubjects().includes(subject))
    throw new ForbiddenException('Authorized reviewer access required.');
}
const authoritySchema = z
  .object({
    id: idSchema,
    pact_id: idSchema,
    version: z.number().int(),
    proposal: z
      .object({ proposalSha256: z.string(), staffDecisionId: idSchema.optional() })
      .passthrough(),
  })
  .passthrough();
export async function staffAuthorization(db: PoolClient, resolution: unknown, actorId: string) {
  const r = authoritySchema.safeParse(resolution);
  if (!r.success || !r.data.proposal.staffDecisionId) return false;
  const d = (
    await db.query(
      `SELECT d.*,u.auth_subject,c.assigned_to,c.status FROM support_decisions d
    JOIN support_cases c ON c.id=d.case_id JOIN users u ON u.id=d.reviewer_id
    WHERE d.id=$1 AND d.resolution_id=$2 AND c.pact_id=$3`,
      [r.data.proposal.staffDecisionId, r.data.id, r.data.pact_id],
    )
  ).rows[0];
  return (
    !!d &&
    d.reviewer_id === actorId &&
    d.assigned_to === actorId &&
    d.status === 'DECIDED' &&
    reviewerSubjects().includes(d.auth_subject) &&
    d.resolution_version === r.data.version &&
    d.proposal_sha256 === r.data.proposal.proposalSha256 &&
    !(
      await db.query('SELECT 1 FROM parties WHERE pact_id=$1 AND user_id=$2', [
        r.data.pact_id,
        actorId,
      ])
    ).rowCount
  );
}
