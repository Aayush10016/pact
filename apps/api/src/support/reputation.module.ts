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
} from '@nestjs/common';
import { z } from 'zod';
import { idSchema } from '@pact/types';
import {
  AuthModule,
  AuthenticationGuard,
  type AuthRequest,
  type Identity,
} from '../auth/auth.module';
import { Database, member, audit } from '../database/database.module';
import { parse } from '../pacts/lifecycle.service';
import { requireReviewer } from '../payments/refund-authority';
const inputSchema = z
  .object({ stars: z.number().int().min(1).max(5), body: z.string().trim().min(10).max(1500) })
  .strict();
@Injectable()
export class ReputationService {
  constructor(@Inject(Database) readonly db: Database) {}
  async publish(pid: string, actor: Identity, input: unknown) {
    parse(idSchema, pid);
    const v = parse(inputSchema, input);
    return this.db.transaction(async (db) => {
      const p = await member(db, pid, actor.id, true);
      const t = (await db.query('SELECT * FROM transactions WHERE pact_id=$1', [pid])).rows[0];
      if (
        !['COMPLETED', 'RESOLVED'].includes(p.status) ||
        !['CAPTURED', 'COMPLETED'].includes(t.state) ||
        p.role !== t.payer_role
      )
        throw new ForbiddenException(
          'Only the payer of a settled, confirmed payment can review the other party.',
        );
      const seller = (
        await db.query('SELECT user_id FROM parties WHERE pact_id=$1 AND role<>$2', [
          pid,
          t.payer_role,
        ])
      ).rows[0];
      if (!seller || seller.user_id === actor.id) throw new ForbiddenException();
      const prior = (await db.query('SELECT * FROM seller_reviews WHERE pact_id=$1', [pid]))
        .rows[0];
      if (prior) {
        if (prior.stars === v.stars && prior.body === v.body) return prior;
        throw new ConflictException('A verified review is already published for this Pact.');
      }
      const review = (
        await db.query(
          'INSERT INTO seller_reviews(pact_id,author_id,seller_id,stars,body) VALUES($1,$2,$3,$4,$5) RETURNING id',
          [pid, actor.id, seller.user_id, v.stars, v.body],
        )
      ).rows[0];
      await audit(db, pid, actor.id, 'SELLER_REVIEW_PUBLISHED', { reviewId: review.id });
      return review;
    });
  }
  async own(pid: string, actor: Identity) {
    parse(idSchema, pid);
    return this.db.transaction(async (db) => {
      const p = await member(db, pid, actor.id);
      const t = (
        await db.query('SELECT state,payer_role FROM transactions WHERE pact_id=$1', [pid])
      ).rows[0];
      const seller = (
        await db.query('SELECT user_id FROM parties WHERE pact_id=$1 AND role<>$2', [
          pid,
          t.payer_role,
        ])
      ).rows[0];
      const review =
        (await db.query('SELECT id,stars,body FROM seller_reviews WHERE pact_id=$1', [pid]))
          .rows[0] ?? null;
      return {
        eligible:
          p.role === t.payer_role &&
          ['COMPLETED', 'RESOLVED'].includes(p.status) &&
          ['CAPTURED', 'COMPLETED'].includes(t.state) &&
          !review,
        sellerId: seller?.user_id ?? null,
        review,
      };
    });
  }
  async directory() {
    return (
      await this.db.query(
        `SELECT u.id,u.display_name,count(*)::int review_count,round(avg(r.stars),1)::text average_rating FROM seller_reviews r JOIN users u ON u.id=r.seller_id WHERE NOT EXISTS(SELECT 1 FROM review_moderation m WHERE m.review_id=r.id) GROUP BY u.id,u.display_name ORDER BY review_count DESC,u.display_name LIMIT 100`,
      )
    ).rows;
  }
  async profile(sid: string) {
    parse(idSchema, sid);
    const reviews = (
      await this.db.query(
        `SELECT r.id,r.stars,r.body,r.created_at FROM seller_reviews r WHERE r.seller_id=$1 AND NOT EXISTS(SELECT 1 FROM review_moderation m WHERE m.review_id=r.id) ORDER BY r.created_at DESC LIMIT 100`,
        [sid],
      )
    ).rows;
    const person = (await this.db.query('SELECT id,display_name FROM users WHERE id=$1', [sid]))
      .rows[0];
    return { seller: reviews.length ? person : null, reviews };
  }
  async moderate(rid: string, actor: Identity, input: unknown) {
    requireReviewer(actor.subject);
    parse(idSchema, rid);
    const v = parse(z.object({ reason: z.string().trim().min(10).max(1000) }).strict(), input);
    return this.db.transaction(async (db) => {
      const review = (await db.query('SELECT * FROM seller_reviews WHERE id=$1', [rid])).rows[0];
      if (!review) throw new ConflictException('Review unavailable.');
      if (review.author_id === actor.id || review.seller_id === actor.id)
        throw new ForbiddenException('Another reviewer must moderate a review involving you.');
      await db.query(
        'INSERT INTO review_moderation(review_id,actor_id,reason) VALUES($1,$2,$3) ON CONFLICT(review_id) DO NOTHING',
        [rid, actor.id, v.reason],
      );
      await audit(db, review.pact_id, actor.id, 'SELLER_REVIEW_HIDDEN', {
        reviewId: rid,
        reason: v.reason,
      });
      return { hidden: true };
    });
  }
}
@Controller('v1')
@UseGuards(AuthenticationGuard)
class ReputationController {
  constructor(@Inject(ReputationService) readonly s: ReputationService) {}
  @Get('pacts/:id/review') async own(@Param('id') id: string, @Req() r: AuthRequest) {
    return { data: await this.s.own(id, r.identity) };
  }
  @Post('pacts/:id/review') async publish(
    @Param('id') id: string,
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return { data: await this.s.publish(id, r.identity, b) };
  }
  @Get('sellers') async sellers() {
    return { data: await this.s.directory() };
  }
  @Get('sellers/:id') async profile(@Param('id') id: string) {
    return { data: await this.s.profile(id) };
  }
  @Post('staff/reviews/:id/hide') async hide(
    @Param('id') id: string,
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return { data: await this.s.moderate(id, r.identity, b) };
  }
}
@Module({
  imports: [AuthModule],
  controllers: [ReputationController],
  providers: [ReputationService],
})
export class ReputationModule {}
