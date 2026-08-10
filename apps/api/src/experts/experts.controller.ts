import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RequirePermission } from '../auth/permissions';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { ExpertCredentialFile, ExpertCredentialsService } from './expert-credentials.service';
import { CreateExpertDto, ExpertListQueryDto, ReviewExpertDto, UpdateExpertDto } from './experts.dto';
import { ExpertsService } from './experts.service';

@Controller('experts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExpertsController {
  constructor(private readonly experts: ExpertsService, private readonly credentials: ExpertCredentialsService) {}

  @Get()
  @RequirePermission('EXPERTS', 'VIEW')
  list(@Query() query: ExpertListQueryDto, @CurrentUser() user: AuthUser) { return this.experts.list(query, user); }

  @Get('options')
  options(@CurrentUser() user: AuthUser) { return this.experts.options(user); }

  @Get(':id/payment-details')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('EXPERTS', 'EDIT')
  paymentDetails(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.experts.paymentDetails(id, user.id, user);
  }

  @Get(':id/sensitive')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('EXPERTS', 'EDIT')
  sensitiveDetails(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.experts.sensitiveDetails(id, user.id, user);
  }

  @Post()
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('EXPERTS', 'EDIT')
  create(@Body() dto: CreateExpertDto, @CurrentUser() user: AuthUser) { return this.experts.create(dto, user.id, user); }

  @Patch(':id')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('EXPERTS', 'EDIT')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExpertDto, @CurrentUser() user: AuthUser) {
    return this.experts.update(id, dto, user.id, user);
  }

  @Delete(':id')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('EXPERTS', 'EDIT')
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.experts.deactivate(id, user.id, user);
  }

  @Post(':id/review')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('EXPERTS', 'REVIEW')
  review(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewExpertDto, @CurrentUser() user: AuthUser) {
    return this.experts.review(id, dto, user.id, user);
  }

  @Post(':id/credentials')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('EXPERTS', 'EDIT')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async uploadCredential(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: ExpertCredentialFile | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('请选择需要上传的资质附件');
    await this.experts.assertScope(id, user);
    return this.credentials.upload(id, file, user.id);
  }

  @Get(':id/credentials/:attachmentId')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('EXPERTS', 'EDIT')
  async downloadCredential(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.experts.assertScope(id, user);
    const { stream, attachment } = await this.credentials.download(id, attachmentId, user.id);
    return new StreamableFile(stream, {
      type: attachment.contentType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      length: Number(attachment.sizeBytes),
    });
  }

  @Delete(':id/credentials/:attachmentId')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('EXPERTS', 'EDIT')
  async removeCredential(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.experts.assertScope(id, user);
    return this.credentials.remove(id, attachmentId, user.id);
  }
}
