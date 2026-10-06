import { Controller, Module, NotImplementedException, Post, UseGuards } from '@nestjs/common';
import { AuthenticationGuard, AuthModule } from '../auth/auth.module';
export interface PaymentAdapter { executeAuthorizedAction(): Promise<never>; }
export class DisabledPayPalAdapter implements PaymentAdapter {
  async executeAuthorizedAction(): Promise<never> { throw new Error('PayPal execution is disabled in Phase 1.'); }
}
@Controller('v1/payments')
@UseGuards(AuthenticationGuard)
class PaymentsController {
  @Post('execute') execute(): never { throw new NotImplementedException(); }
}
@Module({ imports: [AuthModule], controllers: [PaymentsController] })
export class PaymentsModule {}
