import { Controller, Get, Module, Inject, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthModule, AuthenticationGuard } from './auth/auth.module';
import { EvidenceModule } from './evidence/evidence.module';
import { R2Storage } from './evidence/storage';
import { PaymentsModule } from './payments/payments.module';
import { PayPalProvider } from './payments/paypal.provider';
@Controller('v1/capabilities')
@UseGuards(AuthenticationGuard)
class CapabilitiesController {
  constructor(
    @Inject(R2Storage) readonly storage: R2Storage,
    @Inject(PayPalProvider) readonly paypal: PayPalProvider,
  ) {}
  @Get() async get() {
    let advisory = false;
    if (process.env.AI_SERVICE_URL && process.env.AI_SERVICE_KEY)
      try {
        const response = await fetch(new URL('/v1/providers', process.env.AI_SERVICE_URL), {
          signal: AbortSignal.timeout(3000),
        });
        advisory =
          response.ok &&
          z.object({ data: z.object({ enabled: z.boolean() }) }).parse(await response.json()).data
            .enabled;
      } catch {
        advisory = false;
      }
    return {
      data: {
        storage: this.storage.enabled(),
        paypal: this.paypal.enabled(),
        advisory,
        workers: process.env.WORKERS_ENABLED === 'true',
      },
    };
  }
}
@Module({
  imports: [AuthModule, EvidenceModule, PaymentsModule],
  controllers: [CapabilitiesController],
})
export class CapabilitiesModule {}
