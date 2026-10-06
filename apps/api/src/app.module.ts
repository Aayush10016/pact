import { CapabilitiesModule } from './capabilities.module';
import { JobsModule } from './jobs/jobs.module';
import { EvidenceModule } from './evidence/evidence.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { DatabaseModule } from './database/database.module';
import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { PactsModule } from './pacts/pacts.module';
import { PaymentsModule } from './payments/payments.module';
@Module({
  imports: [
    DatabaseModule,
    CapabilitiesModule,
    JobsModule,
    EvidenceModule,
    AssessmentsModule,
    HealthModule,
    PactsModule,
    PaymentsModule,
  ],
})
export class AppModule {}
