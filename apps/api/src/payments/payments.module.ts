import {
  Controller,
  Module,
  Post,
  Get,
  Param,
  Req,
  Body,
  UseGuards,
  Inject,
  ForbiddenException,
  HttpCode,
  Headers,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthModule, AuthenticationGuard, type AuthRequest } from '../auth/auth.module';
import { Database, enqueue } from '../database/database.module';
import { ResolutionService } from './resolution.service';
import { PayPalProvider } from './paypal.provider';
import { ReceiptsService } from './receipts.service';
export class DisabledPayPalAdapter {
  async executeAuthorizedAction(): Promise<never> {
    throw new Error('Unscoped financial execution is disabled.');
  }
}
@Controller('v1/pacts/:id')
@UseGuards(AuthenticationGuard)
class PaymentsController {
  constructor(
    @Inject(ResolutionService) private readonly service: ResolutionService,
    @Inject(ReceiptsService) private readonly receipts: ReceiptsService,
  ) {}
  @Get('receipts') async receiptList(@Param('id') id: string, @Req() req: AuthRequest) {
    return { data: await this.receipts.list(id, req.identity) };
  }
  @Get('receipts/:kind/:receiptId') async receipt(
    @Param('id') id: string,
    @Param('kind') kind: string,
    @Param('receiptId') receiptId: string,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.receipts.read(id, kind, receiptId, req.identity) };
  }
  @Post('resolutions') async propose(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return { data: await this.service.propose(id, req.identity, body) };
  }
  @Post('resolutions/:rid/decision') async approve(
    @Param('id') id: string,
    @Param('rid') rid: string,
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return { data: await this.service.approve(id, rid, req.identity, body) };
  }
  @Post('resolutions/:rid/execute') async execute(
    @Param('id') id: string,
    @Param('rid') rid: string,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.service.execute(id, rid, req.identity) };
  }
  @Post('payment/order') async order(@Param('id') id: string, @Req() req: AuthRequest) {
    return { data: await this.service.payment(id, req.identity, 'ORDER') };
  }
  @Post('payment/capture') async capture(@Param('id') id: string, @Req() req: AuthRequest) {
    return { data: await this.service.payment(id, req.identity, 'CAPTURE') };
  }
  @Get('payment/operations/:oid') async operation(
    @Param('id') id: string,
    @Param('oid') oid: string,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.service.operation(id, oid, req.identity) };
  }
}
@Controller('v1/payments')
@UseGuards(AuthenticationGuard)
class LegacyPaymentsController {
  @Post('execute') execute(): never {
    throw new ForbiddenException('Use the scoped, versioned resolution workflow.');
  }
}
const eventSchema = z
  .object({
    id: z.string().min(1).max(100),
    event_type: z.string().max(100),
    resource: z.record(z.string(), z.unknown()),
  })
  .passthrough();
@Controller('v1/webhooks/paypal')
class WebhookController {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(PayPalProvider) readonly paypal: PayPalProvider,
  ) {}
  @Post() @HttpCode(200) async receive(
    @Body() body: unknown,
    @Headers() headers: Record<string, string>,
  ) {
    await this.db.ensureRuntimeRole();
    const result = eventSchema.safeParse(body);
    if (!result.success) throw new ForbiddenException('Invalid webhook.');
    const required = [
      'paypal-transmission-id',
      'paypal-transmission-time',
      'paypal-transmission-sig',
      'paypal-cert-url',
      'paypal-auth-algo',
    ];
    if (
      required.some((k) => typeof headers[k] !== 'string' || headers[k].length > 4096) ||
      !(await this.paypal.verify(headers, body))
    )
      throw new ForbiddenException('Webhook authenticity could not be verified.');
    const event = result.data;
    const allowed = new Set([
      'CHECKOUT.ORDER.APPROVED',
      'PAYMENT.CAPTURE.COMPLETED',
      'PAYMENT.CAPTURE.REFUNDED',
      'PAYMENT.CAPTURE.DENIED',
    ]);
    const resource = event.resource;
    const minimal = {
      id: event.id,
      event_type: event.event_type,
      resource: {
        id: resource.id,
        status: resource.status,
        amount: resource.amount,
        supplementary_data: resource.supplementary_data,
      },
    };
    await this.db.transaction(async (db) => {
      const receipt = await db.query(
        "INSERT INTO paypal_webhook_events(provider_event_id,event_type,verification_status,payload) VALUES($1,$2,'VERIFIED',$3) ON CONFLICT(provider_event_id) DO NOTHING RETURNING id",
        [event.id, event.event_type, JSON.stringify(minimal)],
      );
      if (receipt.rowCount && allowed.has(event.event_type))
        await enqueue(db, 'WEBHOOK', receipt.rows[0].id, `webhook-${receipt.rows[0].id}`);
      else if (receipt.rowCount)
        await db.query(
          "UPDATE paypal_webhook_events SET processed_at=now(),processing_status='IGNORED' WHERE id=$1",
          [receipt.rows[0].id],
        );
    });
    return { received: true };
  }
}
@Module({
  imports: [AuthModule],
  controllers: [PaymentsController, LegacyPaymentsController, WebhookController],
  providers: [PayPalProvider, ResolutionService, ReceiptsService],
  exports: [PayPalProvider, ResolutionService],
})
export class PaymentsModule {}
