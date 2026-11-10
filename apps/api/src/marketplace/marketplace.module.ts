import {
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  createPactSchema,
  idSchema,
  serviceAgreementSchema,
  serviceWriteSchema,
} from '@pact/types';
import { PayPalAccountsModule, PayPalAccountsService } from '../accounts/paypal-accounts.module';
import {
  AuthModule,
  AuthenticationGuard,
  type AuthRequest,
  type Identity,
} from '../auth/auth.module';
import { Database, audit } from '../database/database.module';
import { PactsModule } from '../pacts/pacts.module';
import { LifecycleService, parse } from '../pacts/lifecycle.service';
const columns = `s.id,s.owner_id,s.title,s.description,s.category,s.acceptance_criteria,s.expected_evidence,s.amount_minor,s.currency,s.delivery_days,s.published,s.version,u.display_name,COALESCE(a.status='READY',false) AS paypal_ready,
 (SELECT count(*)::int FROM seller_reviews r WHERE r.seller_id=s.owner_id AND NOT EXISTS(SELECT 1 FROM review_moderation m WHERE m.review_id=r.id)) AS review_count,
 (SELECT round(avg(r.stars),1)::text FROM seller_reviews r WHERE r.seller_id=s.owner_id AND NOT EXISTS(SELECT 1 FROM review_moderation m WHERE m.review_id=r.id)) AS average_rating`;
const joins =
  'FROM service_listings s JOIN users u ON u.id=s.owner_id LEFT JOIN paypal_accounts a ON a.user_id=s.owner_id';
@Injectable()
export class MarketplaceService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(LifecycleService) readonly lifecycle: LifecycleService,
  ) {}
  async browse(value: unknown) {
    const q = parse(
      z
        .object({
          q: z.string().trim().max(120).optional(),
          category: z.string().trim().max(60).optional(),
          page: z.coerce.number().int().min(1).max(1000).default(1),
        })
        .strict(),
      value,
    );
    return (
      await this.db.query(
        `SELECT ${columns} ${joins} WHERE s.published
      AND ($1='' OR to_tsvector('simple',s.title || ' ' || s.description || ' ' || s.category || ' ' || u.display_name) @@ plainto_tsquery('simple',$1))
      AND ($2='' OR lower(s.category)=lower($2)) ORDER BY s.updated_at DESC,s.id LIMIT 24 OFFSET $3`,
        [q.q ?? '', q.category ?? '', (q.page - 1) * 24],
      )
    ).rows;
  }
  async detail(id: string) {
    parse(idSchema, id);
    const row = (
      await this.db.query(`SELECT ${columns} ${joins} WHERE s.id=$1 AND s.published`, [id])
    ).rows[0];
    if (!row) throw new NotFoundException('This service is no longer published.');
    return row;
  }
  async mine(userId: string) {
    return (
      await this.db.query(
        `SELECT ${columns} ${joins} WHERE s.owner_id=$1 ORDER BY s.updated_at DESC LIMIT 100`,
        [userId],
      )
    ).rows;
  }
  async save(userId: string, id: string | null, value: unknown) {
    const data = parse(serviceWriteSchema, value);
    if (id) parse(idSchema, id);
    return this.db.transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        userId + data.requestId,
      ]);
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        userId + '-service-listings',
      ]);
      const existing = (
        await db.query(
          'SELECT * FROM service_listings WHERE owner_id=$1 AND ' +
            (id ? 'id=$2' : 'request_id=$2') +
            ' FOR UPDATE',
          [userId, id ?? data.requestId],
        )
      ).rows[0];
      if (id && (!existing || existing.version !== data.expectedVersion))
        throw new ConflictException('Service changed or is unavailable. Refresh before saving.');
      if (!id && existing) {
        const fields = [
          ['title', data.title],
          ['description', data.description],
          ['category', data.category],
          ['acceptance_criteria', data.acceptanceCriteria],
          ['expected_evidence', data.expectedEvidence],
          ['amount_minor', data.amountMinor],
          ['currency', data.currency],
          ['delivery_days', data.deliveryDays],
          ['published', data.published],
        ];
        if (fields.some(([key, v]) => String(existing[String(key)]) !== String(v)))
          throw new ConflictException(
            'This request key was already used for different service content.',
          );
        return { id: existing.id, version: existing.version };
      }
      if (!id && data.expectedVersion !== 0)
        throw new ConflictException('New services start at version zero.');
      if (
        !id &&
        (
          await db.query('SELECT 1 FROM service_listings WHERE owner_id=$1 OFFSET 49 LIMIT 1', [
            userId,
          ])
        ).rowCount
      )
        throw new ConflictException('You can manage up to 50 services.');
      const args = [
        userId,
        data.title,
        data.description,
        data.category,
        data.acceptanceCriteria,
        data.expectedEvidence,
        data.amountMinor,
        data.currency,
        data.deliveryDays,
        data.published,
      ];
      const result = id
        ? await db.query(
            'UPDATE service_listings SET title=$2,description=$3,category=$4,acceptance_criteria=$5,expected_evidence=$6,amount_minor=$7,currency=$8,delivery_days=$9,published=$10,version=version+1,updated_at=now() WHERE owner_id=$1 AND id=$11 RETURNING id,version',
            [...args, id],
          )
        : await db.query(
            'INSERT INTO service_listings(owner_id,title,description,category,acceptance_criteria,expected_evidence,amount_minor,currency,delivery_days,published,request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,version',
            [...args, data.requestId],
          );
      return result.rows[0];
    });
  }
  async request(id: string, user: Identity, value: unknown) {
    parse(idSchema, id);
    const data = parse(serviceAgreementSchema, value);
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ listingId: id, ...data }))
      .digest('hex');
    return this.db.transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        user.id + data.requestId,
      ]);
      const prior = (
        await db.query(
          'SELECT p.id,p.request_sha256 FROM marketplace_agreements a JOIN pacts p ON p.id=a.pact_id WHERE a.buyer_id=$1 AND a.request_id=$2',
          [user.id, data.requestId],
        )
      ).rows[0];
      if (prior) {
        if (prior.request_sha256 !== fingerprint)
          throw new ConflictException('Request key reused for different terms.');
        return { id: prior.id };
      }
      if (
        (
          await db.query('SELECT 1 FROM pacts WHERE created_by=$1 AND client_request_id=$2', [
            user.id,
            data.requestId,
          ])
        ).rowCount
      )
        throw new ConflictException(
          'This request identifier already belongs to another agreement.',
        );
      const service = (
        await db.query(
          'SELECT s.*,u.email FROM service_listings s JOIN users u ON u.id=s.owner_id WHERE s.id=$1 AND s.published FOR SHARE OF s',
          [id],
        )
      ).rows[0];
      if (!service || service.version !== data.expectedVersion)
        throw new ConflictException(
          'The service has changed. Review its latest terms before creating a Pact.',
        );
      if (service.owner_id === user.id)
        throw new ConflictException(
          'Choose a service from another member. Your account can buy and sell, but cannot contract with itself.',
        );
      const pact = (
        await db.query(
          'INSERT INTO pacts(title,agreement,payment_condition,created_by,client_request_id,request_sha256) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
          [
            service.title,
            service.description,
            data.paymentCondition,
            user.id,
            data.requestId,
            fingerprint,
          ],
        )
      ).rows[0];
      await db.query("INSERT INTO parties(pact_id,user_id,role) VALUES($1,$2,'PARTY_A')", [
        pact.id,
        user.id,
      ]);
      await db.query('INSERT INTO pact_invitations(pact_id,email) VALUES($1,$2)', [
        pact.id,
        service.email,
      ]);
      await db.query(
        "INSERT INTO transactions(pact_id,amount_minor,currency,payer_role,payment_route) VALUES($1,$2,$3,'PARTY_A','CONNECTED')",
        [pact.id, service.amount_minor, service.currency],
      );
      await this.lifecycle.insertCommitment(
        db,
        pact.id,
        service.owner_id,
        {
          title: service.title,
          description: service.description,
          acceptanceCriteria: service.acceptance_criteria,
          expectedEvidence: service.expected_evidence,
          milestones: [],
        },
        0,
      );
      const snapshot = {
        title: service.title,
        description: service.description,
        category: service.category,
        acceptanceCriteria: service.acceptance_criteria,
        expectedEvidence: service.expected_evidence,
        amountMinor: service.amount_minor,
        currency: service.currency,
        deliveryDays: service.delivery_days,
      };
      await db.query(
        'INSERT INTO marketplace_agreements(pact_id,listing_id,listing_version,snapshot,seller_id,buyer_id,request_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          pact.id,
          id,
          service.version,
          JSON.stringify(snapshot),
          service.owner_id,
          user.id,
          data.requestId,
        ],
      );
      await audit(db, pact.id, user.id, 'PACT_CREATED', { source: 'MARKETPLACE', listingId: id });
      return { id: pact.id };
    });
  }
}
@Controller('v1/marketplace')
class MarketplacePublicController {
  constructor(@Inject(MarketplaceService) readonly service: MarketplaceService) {}
  @Get() async browse(@Query() query: unknown) {
    await this.service.db.ensureRuntimeRole();
    return { data: await this.service.browse(query) };
  }
  @Get(':id') async detail(@Param('id') id: string) {
    await this.service.db.ensureRuntimeRole();
    return { data: await this.service.detail(id) };
  }
}
@Controller('v1/services')
@UseGuards(AuthenticationGuard)
class ServicesController {
  constructor(
    @Inject(MarketplaceService) readonly service: MarketplaceService,
    @Inject(PayPalAccountsService) readonly accounts: PayPalAccountsService,
  ) {}
  @Post('direct-agreement/create') async direct(
    @Req() req: AuthRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    const input = parse(
      createPactSchema.extend({ paymentMode: z.literal('CONNECTED') }).strict(),
      body,
    );
    parse(idSchema, key);
    const { paymentMode: mode, ...terms } = input;
    void mode;
    const receiver =
      input.payerRole === 'PARTY_B'
        ? req.identity.id
        : (
            await this.service.db.query('SELECT id FROM users WHERE lower(email)=$1', [
              input.counterpartyEmail,
            ])
          ).rows[0]?.id;
    if (!receiver)
      throw new ConflictException(
        'The person receiving payment needs a verified Pact account and a connected PayPal account first. No agreement or payment has been created.',
      );
    const merchantId = await this.accounts.requireReady(receiver);
    return {
      data: await this.service.lifecycle.create(req.identity, terms, key, {
        userId: receiver,
        merchantId,
      }),
    };
  }
  @Get() async mine(@Req() req: AuthRequest) {
    return { data: await this.service.mine(req.identity.id) };
  }
  @Post() async create(@Req() req: AuthRequest, @Body() body: unknown) {
    return { data: await this.service.save(req.identity.id, null, body) };
  }
  @Post(':id') async update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return { data: await this.service.save(req.identity.id, id, body) };
  }
  @Post(':id/request') async request(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return { data: await this.service.request(id, req.identity, body) };
  }
}
@Module({
  imports: [AuthModule, PactsModule, PayPalAccountsModule],
  providers: [MarketplaceService],
  controllers: [MarketplacePublicController, ServicesController],
})
export class MarketplaceModule {}
