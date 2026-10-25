import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuthModule, AuthenticationGuard, type AuthRequest } from '../auth/auth.module';
import { Database } from '../database/database.module';
import { PayPalProvider, ProviderError } from '../payments/paypal.provider';
import { parse } from '../pacts/lifecycle.service';

const merchantSchema = z.object({
  merchant_id: z.string().regex(/^[A-Z0-9]{8,32}$/),
  tracking_id: z.string(),
  payments_receivable: z.boolean(),
  primary_email_confirmed: z.boolean(),
  oauth_integrations: z
    .array(
      z.object({
        oauth_third_party: z
          .array(
            z.object({
              partner_client_id: z.string(),
              scopes: z.array(z.string()),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});
// PayPal referral IDs are opaque encoded tokens, not short merchant IDs.
const referralToken = z.string().regex(/^[A-Za-z0-9_+=/-]{1,2048}$/);
export function referralIdFromSelf(href: string) {
  const url = new URL(href);
  const prefix = '/v2/customer/partner-referrals/';
  if (
    !['https://api-m.sandbox.paypal.com', 'https://api.sandbox.paypal.com'].includes(url.origin) ||
    url.username ||
    url.password ||
    !url.pathname.startsWith(prefix) ||
    url.search ||
    url.hash
  )
    throw new ServiceUnavailableException('PayPal returned an unexpected onboarding reference.');
  return referralToken.parse(decodeURIComponent(url.pathname.slice(prefix.length)));
}
export function verifiedMerchant(value: unknown, trackingId: string, clientId: string) {
  const parsed = merchantSchema.safeParse(value);
  if (!parsed.success || parsed.data.tracking_id !== trackingId) return null;
  const merchant = parsed.data;
  const grant = merchant.oauth_integrations
    .flatMap((v) => v.oauth_third_party)
    .find(
      (v) =>
        v.partner_client_id === clientId &&
        v.scopes.includes('https://uri.paypal.com/services/payments/refund') &&
        v.scopes.includes('https://uri.paypal.com/services/payments/payment/authcapture'),
    );
  return {
    merchantId: merchant.merchant_id,
    ready: merchant.payments_receivable && merchant.primary_email_confirmed && !!grant,
  };
}
@Injectable()
export class PayPalAccountsService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(PayPalProvider) readonly paypal: PayPalProvider,
  ) {}
  async status(userId: string) {
    const row = (
      await this.db.query(
        'SELECT status,checked_at,onboarding_url FROM paypal_accounts WHERE user_id=$1',
        [userId],
      )
    ).rows[0];
    return {
      configured: this.paypal.partnerConfigured(),
      status: row?.status ?? 'NOT_CONNECTED',
      checkedAt: row?.checked_at ?? null,
      onboardingUrl: row?.onboarding_url ?? null,
    };
  }
  private configured() {
    if (!this.paypal.partnerConfigured())
      throw new ConflictException(
        'PayPal account connection needs an approved platform app and its Sandbox partner configuration. You can still create agreements and prepare service listings.',
      );
  }
  async connect(userId: string, value: unknown) {
    this.configured();
    parse(z.object({ consent: z.literal(true) }).strict(), value);
    // A durable identity is saved before the provider call, so an interrupted redirect cannot connect someone else's account.
    const account = (
      await this.db.query(
        'INSERT INTO paypal_accounts(user_id,tracking_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET updated_at=now() RETURNING *',
        [userId, randomUUID()],
      )
    ).rows[0]!;
    if (account.status === 'READY') return this.status(userId);
    const referralId = account.referral_id ? referralToken.parse(account.referral_id) : null;
    const referral = z
      .object({ links: z.array(z.object({ rel: z.string(), href: z.url() })) })
      .parse(
        await this.paypal.platform().request(
          referralId
            ? `/v2/customer/partner-referrals/${encodeURIComponent(referralId)}`
            : '/v2/customer/partner-referrals',
          referralId ? 'GET' : 'POST',
          referralId
            ? undefined
            : {
                tracking_id: account.tracking_id,
                partner_config_override: {
                  return_url: `${process.env.WEB_ORIGIN}/workspace/account`,
                  return_url_description: 'Return to Pact',
                },
                operations: [
                  {
                    operation: 'API_INTEGRATION',
                    api_integration_preference: {
                      rest_api_integration: {
                        integration_method: 'PAYPAL',
                        integration_type: 'THIRD_PARTY',
                        third_party_details: { features: ['PAYMENT', 'REFUND'] },
                      },
                    },
                  },
                ],
                products: ['EXPRESS_CHECKOUT'],
                legal_consents: [{ type: 'SHARE_DATA_CONSENT', granted: true }],
              },
          account.tracking_id,
        ),
      );
    const action = referral.links.find((v) => v.rel === 'action_url')?.href;
    const self = referral.links.find((v) => v.rel === 'self')?.href;
    if (!action || !/^https:\/\/(?:www\.)?sandbox\.paypal\.com\//.test(action))
      throw new ServiceUnavailableException(
        'PayPal did not return a trusted Sandbox connection link.',
      );
    await this.db.query(
      "UPDATE paypal_accounts SET onboarding_url=$2,referral_id=$3,status='PENDING',updated_at=now() WHERE user_id=$1 AND status<>'READY'",
      [userId, action, self ? referralIdFromSelf(self) : referralId],
    );
    return this.status(userId);
  }
  async refresh(userId: string) {
    this.configured();
    const account = (
      await this.db.query('SELECT * FROM paypal_accounts WHERE user_id=$1', [userId])
    ).rows[0];
    if (!account) throw new ConflictException('Start PayPal account connection first.');
    // Browser return parameters never establish merchant identity or permissions.
    const base = `/v1/customer/partners/${encodeURIComponent(process.env.PAYPAL_PLATFORM_MERCHANT_ID!)}/merchant-integrations`;
    const discoveryValue = await this.readConnection(
      `${base}?tracking_id=${encodeURIComponent(account.tracking_id)}`,
    );
    const discovery = z
      .object({ merchant_id: z.string().regex(/^[A-Z0-9]{8,32}$/) })
      .safeParse(discoveryValue);
    if (!discovery.success)
      throw new ConflictException(
        'PayPal has not confirmed this connection yet. Finish its onboarding steps and refresh.',
      );
    const fact = verifiedMerchant(
      await this.readConnection(`${base}/${discovery.data.merchant_id}`),
      account.tracking_id,
      process.env.PAYPAL_PLATFORM_CLIENT_ID!,
    );
    if (!fact || fact.merchantId !== discovery.data.merchant_id)
      throw new ConflictException('PayPal could not verify the account association.');
    if (account.merchant_id && account.merchant_id !== fact.merchantId)
      throw new ConflictException(
        'This connection belongs to a different PayPal merchant. Contact support before changing payment identity.',
      );
    const duplicate = await this.db.query(
      'SELECT 1 FROM paypal_accounts WHERE merchant_id=$1 AND user_id<>$2',
      [fact.merchantId, userId],
    );
    if (duplicate.rowCount)
      throw new ConflictException(
        'This PayPal account is already connected to another Pact identity.',
      );
    await this.db.query(
      "UPDATE paypal_accounts SET merchant_id=$2,status=$3,checked_at=now(),updated_at=now(),onboarding_url=CASE WHEN $3='READY' THEN NULL ELSE onboarding_url END WHERE user_id=$1",
      [userId, fact.merchantId, fact.ready ? 'READY' : 'RESTRICTED'],
    );
    return this.status(userId);
  }
  private async readConnection(path: string): Promise<unknown> {
    try {
      return await this.paypal.platform().request(path, 'GET');
    } catch (e) {
      if (e instanceof ProviderError && e.diagnostic.http === 404)
        throw new ConflictException(
          'PayPal has not confirmed an account connection for this Pact profile yet. Choose Continue to PayPal Sandbox, log in with your Sandbox seller account and finish granting permissions. Then return here and check the connection again. This check does not charge or refund anything.',
        );
      throw e;
    }
  }
  async requireReady(userId: string) {
    await this.refresh(userId);
    const row = (
      await this.db.query(
        "SELECT merchant_id FROM paypal_accounts WHERE user_id=$1 AND status='READY'",
        [userId],
      )
    ).rows[0];
    if (!row?.merchant_id)
      throw new ConflictException(
        'The recipient must finish PayPal verification before receiving payment.',
      );
    return row.merchant_id as string;
  }
}
@Controller('v1/me/paypal')
@UseGuards(AuthenticationGuard)
class PayPalAccountsController {
  constructor(@Inject(PayPalAccountsService) readonly service: PayPalAccountsService) {}
  @Get() async status(@Req() req: AuthRequest) {
    return { data: await this.service.status(req.identity.id) };
  }
  @Post('connect') async connect(@Req() req: AuthRequest, @Body() value: unknown) {
    return { data: await this.service.connect(req.identity.id, value) };
  }
  @Post('refresh') async refresh(@Req() req: AuthRequest) {
    return { data: await this.service.refresh(req.identity.id) };
  }
}
@Module({
  imports: [AuthModule],
  providers: [PayPalProvider, PayPalAccountsService],
  controllers: [PayPalAccountsController],
  exports: [PayPalAccountsService],
})
export class PayPalAccountsModule {}
