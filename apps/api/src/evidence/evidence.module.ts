import {
  Module,
  Controller,
  Post,
  Get,
  Param,
  Req,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { AuthenticationGuard, AuthModule, type AuthRequest } from '../auth/auth.module';
import { EvidenceService } from './evidence.service';
import { R2Storage } from './storage';
const upload = FileInterceptor('file', {
  storage: diskStorage({
    destination: tmpdir(),
    filename: (_req, _file, cb) => cb(null, `pact-${randomUUID()}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 1, fieldSize: 8192, parts: 2 },
});
@Controller('v1/pacts/:id/evidence')
@UseGuards(AuthenticationGuard)
class EvidenceController {
  constructor(@Inject(EvidenceService) private readonly service: EvidenceService) {}
  async handle(
    id: string,
    req: AuthRequest,
    metadata: string,
    file: Express.Multer.File,
    eid?: string,
  ) {
    if (!file) throw new BadRequestException('Choose an evidence file.');
    try {
      let input: unknown;
      try {
        input = JSON.parse(metadata);
      } catch {
        throw new BadRequestException('Invalid evidence metadata.');
      }
      return { data: await this.service.upload(id, req.identity, input, file, eid) };
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }
  @Post() @UseInterceptors(upload) async create(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body('metadata') metadata: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.handle(id, req, metadata, file);
  }
  @Post(':eid/versions') @UseInterceptors(upload) async version(
    @Param('id') id: string,
    @Param('eid') eid: string,
    @Req() req: AuthRequest,
    @Body('metadata') metadata: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.handle(id, req, metadata, file, eid);
  }
  @Get('versions/:vid/download') async download(
    @Param('id') id: string,
    @Param('vid') vid: string,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.service.download(id, vid, req.identity) };
  }
}
@Module({
  imports: [AuthModule],
  controllers: [EvidenceController],
  providers: [R2Storage, EvidenceService],
  exports: [R2Storage, EvidenceService],
})
export class EvidenceModule {}
