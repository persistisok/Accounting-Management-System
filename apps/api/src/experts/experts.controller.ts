import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { ExpertCredentialFile, ExpertCredentialsService } from './expert-credentials.service';
import { CreateExpertDto, ExpertListQueryDto, ReviewExpertDto, UpdateExpertDto } from './experts.dto';
import { ExpertsService } from './experts.service';

@Controller('experts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExpertsController {
  constructor(private readonly experts: ExpertsService, private readonly credentials: ExpertCredentialsService) {}

  @Get()
  list(@Query() query: ExpertListQueryDto) { return this.experts.list(query); }

  @Get('options')
  options() { return this.experts.options(); }

  @Get(':id/payment-details')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  paymentDetails(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.experts.paymentDetails(id, user.id);
  }

  @Get(':id/sensitive')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  sensitiveDetails(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.experts.sensitiveDetails(id, user.id);
  }

  @Post()
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  create(@Body() dto: CreateExpertDto, @CurrentUser() user: AuthUser) { return this.experts.create(dto, user.id); }

  @Patch(':id')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExpertDto, @CurrentUser() user: AuthUser) {
    return this.experts.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.experts.deactivate(id, user.id);
  }

  @Post(':id/review')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  review(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewExpertDto, @CurrentUser() user: AuthUser) {
    return this.experts.review(id, dto, user.id);
  }

  @Post(':id/credentials')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  uploadCredential(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: ExpertCredentialFile | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('请选择需要上传的资质附件');
    return this.credentials.upload(id, file, user.id);
  }

  @Get(':id/credentials/:attachmentId')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  async downloadCredential(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const { stream, attachment } = await this.credentials.download(id, attachmentId, user.id);
    return new StreamableFile(stream, {
      type: attachment.contentType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      length: Number(attachment.sizeBytes),
    });
  }

  @Delete(':id/credentials/:attachmentId')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  removeCredential(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.credentials.remove(id, attachmentId, user.id);
  }
}
