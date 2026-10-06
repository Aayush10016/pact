import { DatabaseModule } from './database/database.module';
import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { PactsModule } from './pacts/pacts.module';
import { PaymentsModule } from './payments/payments.module';
@Module({ imports: [DatabaseModule,HealthModule, PactsModule, PaymentsModule] })
export class AppModule {}
