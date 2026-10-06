import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Module,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { demoPacts } from '@pact/shared';
import { draftSchema } from '@pact/types';
@Controller('v1/demo/pacts')
export class DemoPactsController {
  @Get() list() {
    return { data: demoPacts, meta: { sample: true, persisted: false } };
  }
  @Get(':id') detail(@Param('id') id: string) {
    const pact = demoPacts.find((item) => item.id === id);
    if (!pact) throw new NotFoundException('Sample Pact not found.');
    return { data: pact, meta: { sample: true } };
  }
  @Post('validate-draft') validate(@Body() body: unknown) {
    const parsed = draftSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Please check the draft fields.');
    return { data: parsed.data, meta: { persisted: false, paymentEnabled: false } };
  }
}
@Module({ controllers: [DemoPactsController] })
export class PactsModule {}
