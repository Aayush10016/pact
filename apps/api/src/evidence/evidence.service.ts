import {
  Injectable,
  Inject,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import { evidenceInputSchema, idSchema } from '@pact/types';
import { Database, member, audit, enqueue } from '../database/database.module';
import type { Identity } from '../auth/auth.module';
import { parse } from '../pacts/lifecycle.service';
import { EvidenceStorage } from './storage';
import { validateFile } from './file-policy';
@Injectable()
export class EvidenceService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(EvidenceStorage) readonly storage: EvidenceStorage,
  ) {}
  async upload(
    pactId: string,
    user: Identity,
    input: unknown,
    file: Express.Multer.File,
    evidenceId?: string,
  ) {
    parse(idSchema, pactId);
    const data = parse(evidenceInputSchema, input);
    if (evidenceId) parse(idSchema, evidenceId);
    const sha = await validateFile(file);
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ data, sha, evidenceId: evidenceId ?? null }))
      .digest('hex');
    const prior = await this.db.query(
      'SELECT version_id,request_sha256 FROM evidence_upload_requests WHERE pact_id=$1 AND user_id=$2 AND request_id=$3',
      [pactId, user.id, data.requestId],
    );
    if (prior.rowCount) {
      if (prior.rows[0]!.request_sha256 !== fingerprint)
        throw new ConflictException('Upload key was already used for different evidence.');
      return { id: prior.rows[0]!.version_id };
    }
    await this.db.transaction(async (db) => {
      const p = await member(db, pactId, user.id);
      if (!['ACTIVE', 'DISPUTED'].includes(p.status))
        throw new ConflictException('Evidence requires an active or disputed Pact.');
      if (
        !(
          await db.query('SELECT 1 FROM commitments WHERE id=$1 AND pact_id=$2', [
            data.commitmentId,
            pactId,
          ])
        ).rowCount
      )
        throw new NotFoundException('Commitment not found.');
      if (
        evidenceId &&
        !(
          await db.query('SELECT 1 FROM evidence WHERE id=$1 AND pact_id=$2 AND uploaded_by=$3', [
            evidenceId,
            pactId,
            user.id,
          ])
        ).rowCount
      )
        throw new ForbiddenException('Only the uploader can version this evidence.');
    });
    const versionId = randomUUID();
    const id = evidenceId ?? randomUUID();
    const key = `pacts/${pactId}/evidence/${id}/${versionId}`;
    await this.storage.put(key, file.path, file.size, file.mimetype);
    try {
      return await this.db.transaction(async (db) => {
        await member(db, pactId, user.id, true);
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          user.id + data.requestId,
        ]);
        const duplicate = await db.query(
          'SELECT version_id,request_sha256 FROM evidence_upload_requests WHERE pact_id=$1 AND user_id=$2 AND request_id=$3',
          [pactId, user.id, data.requestId],
        );
        if (duplicate.rowCount)
          throw new ConflictException('Upload already completed. Refresh the evidence timeline.');
        const active = await db.query(
          "SELECT 1 FROM paypal_transactions t JOIN transactions tx ON tx.id=t.transaction_id WHERE tx.pact_id=$1 AND (t.status IN ('EXECUTING','PROVIDER_ACCEPTED','NEEDS_RECONCILIATION') OR (t.status='QUEUED' AND EXISTS(SELECT 1 FROM resolutions sr WHERE sr.id=t.resolution_id AND sr.proposal ? 'staffDecisionId'))) AND t.resolution_id IS NOT NULL",
          [pactId],
        );
        if (active.rowCount)
          throw new ConflictException(
            'Evidence cannot change while a financial action is in flight.',
          );
        if (!evidenceId)
          await db.query(
            'INSERT INTO evidence(id,pact_id,commitment_id,uploaded_by,title,occurred_at) VALUES($1,$2,$3,$4,$5,$6)',
            [id, pactId, data.commitmentId, user.id, data.title, data.occurredAt],
          );
        else if (
          !(
            await db.query('SELECT 1 FROM evidence WHERE id=$1 AND pact_id=$2 AND uploaded_by=$3', [
              id,
              pactId,
              user.id,
            ])
          ).rowCount
        )
          throw new ForbiddenException();
        const current = await db.query(
          'SELECT COALESCE(max(version),0)+1 AS next FROM evidence_versions WHERE evidence_id=$1',
          [id],
        );
        await db.query(
          'INSERT INTO evidence_versions(id,evidence_id,version,object_key,content_sha256,mime_type,size_bytes,confirmed_at,client_request_id) VALUES($1,$2,$3,$4,$5,$6,$7,now(),$8)',
          [versionId, id, current.rows[0].next, key, sha, file.mimetype, file.size, data.requestId],
        );
        await db.query(
          'INSERT INTO evidence_upload_requests(pact_id,user_id,request_id,version_id,request_sha256) VALUES($1,$2,$3,$4,$5)',
          [pactId, user.id, data.requestId, versionId, fingerprint],
        );
        const retired = await db.query(
          'UPDATE resolutions SET retired_at=now() WHERE pact_id=$1 AND retired_at IS NULL RETURNING id',
          [pactId],
        );
        for (const r of retired.rows) {
          await db.query(
            "UPDATE paypal_transactions SET status='CANCELLED' WHERE resolution_id=$1 AND status='QUEUED'",
            [r.id],
          );
          await audit(db, pactId, user.id, 'APPROVALS_INVALIDATED', { resolutionId: r.id });
        }
        await audit(
          db,
          pactId,
          user.id,
          evidenceId ? 'EVIDENCE_VERSION_CREATED' : 'EVIDENCE_UPLOADED',
          { evidenceId: id, versionId },
        );
        await enqueue(db, 'EVIDENCE', versionId, `evidence-${versionId}`);
        return { id: versionId, evidenceId: id, state: 'PENDING' };
      });
    } catch (e) {
      await this.storage.remove(key).catch(() => undefined);
      throw e;
    }
  }
  async download(pactId: string, versionId: string, user: Identity) {
    parse(idSchema, pactId);
    parse(idSchema, versionId);
    const key = await this.db.transaction(async (db) => {
      await member(db, pactId, user.id);
      const v = await db.query(
        'SELECT v.object_key,v.scan_state,v.purged_at FROM evidence_versions v JOIN evidence e ON e.id=v.evidence_id WHERE v.id=$1 AND e.pact_id=$2',
        [versionId, pactId],
      );
      if (!v.rowCount) throw new NotFoundException('Evidence version not found.');
      if (v.rows[0].scan_state !== 'CLEAN' || v.rows[0].purged_at)
        throw new ConflictException('Evidence is quarantined or no longer retained.');
      return v.rows[0].object_key as string;
    });
    return { url: await this.storage.download(key), expiresIn: 120 };
  }
}
