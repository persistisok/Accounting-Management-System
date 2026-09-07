import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { AbortMultipartAttachmentDto, CompleteMultipartAttachmentDto, InitMultipartAttachmentDto, MultipartPartUrlDto } from './ledger-attachments.dto';
import { LedgerAttachmentFile, LedgerAttachmentsService } from './ledger-attachments.service';

@Controller('attachments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LedgerAttachmentsController {
  constructor(private readonly attachments: LedgerAttachmentsService) {}

  @Get(':objectType/:objectId')
  async list(
    @Param('objectType') objectType: string,
    @Param('objectId', ParseUUIDPipe) objectId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.attachments.authorize(objectType, objectId, user, 'VIEW');
    return this.attachments.list(objectType, objectId);
  }

  @Post(':objectType/:objectId')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM', 'EXTERNAL')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async upload(
    @Param('objectType') objectType: string,
    @Param('objectId', ParseUUIDPipe) objectId: string,
    @UploadedFile() file: LedgerAttachmentFile | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('请选择需要上传的 PDF 附件');
    await this.attachments.authorize(objectType, objectId, user, 'ENTRY');
    return this.attachments.upload(objectType, objectId, file, user.id);
  }

  @Post(':objectType/:objectId/multipart/init')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM', 'EXTERNAL')
  async initMultipart(
    @Param('objectType') objectType: string,
    @Param('objectId', ParseUUIDPipe) objectId: string,
    @Body() body: InitMultipartAttachmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.assertProjectAttachment(objectType);
    await this.attachments.authorize(objectType, objectId, user, 'ENTRY');
    return this.attachments.initProjectMultipart(objectId, body.fileName, body.sizeBytes, body.headerBase64, user.id);
  }

  @Post(':objectType/:objectId/multipart/part-url')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM', 'EXTERNAL')
  async multipartPartUrl(
    @Param('objectType') objectType: string,
    @Param('objectId', ParseUUIDPipe) objectId: string,
    @Body() body: MultipartPartUrlDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.assertProjectAttachment(objectType);
    await this.attachments.authorize(objectType, objectId, user, 'ENTRY');
    return this.attachments.createProjectPartUrl(objectId, body.token, body.partNumber, user.id);
  }

  @Post(':objectType/:objectId/multipart/complete')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM', 'EXTERNAL')
  async completeMultipart(
    @Param('objectType') objectType: string,
    @Param('objectId', ParseUUIDPipe) objectId: string,
    @Body() body: CompleteMultipartAttachmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.assertProjectAttachment(objectType);
    await this.attachments.authorize(objectType, objectId, user, 'ENTRY');
    return this.attachments.completeProjectMultipart(objectId, body.token, body.parts, user.id);
  }

  @Post(':objectType/:objectId/multipart/abort')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM', 'EXTERNAL')
  async abortMultipart(
    @Param('objectType') objectType: string,
    @Param('objectId', ParseUUIDPipe) objectId: string,
    @Body() body: AbortMultipartAttachmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.assertProjectAttachment(objectType);
    await this.attachments.authorize(objectType, objectId, user, 'ENTRY');
    return this.attachments.abortProjectMultipart(objectId, body.token, user.id);
  }

  @Get(':objectType/:objectId/:attachmentId/download-url')
  async downloadUrl(
    @Param('objectType') objectType: string,
    @Param('objectId', ParseUUIDPipe) objectId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.attachments.authorize(objectType, objectId, user, 'VIEW');
    return this.attachments.getDownloadUrl(objectType, objectId, attachmentId, user.id);
  }

  @Get(':objectType/:objectId/:attachmentId/download')
  async download(
    @Param('objectType') objectType: string,
    @Param('objectId', ParseUUIDPipe) objectId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.attachments.authorize(objectType, objectId, user, 'VIEW');
    const { stream, attachment } = await this.attachments.download(objectType, objectId, attachmentId, user.id);
    return new StreamableFile(stream, {
      type: attachment.contentType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      length: Number(attachment.sizeBytes),
    });
  }

  @Delete(':objectType/:objectId/:attachmentId')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  async remove(
    @Param('objectType') objectType: string,
    @Param('objectId', ParseUUIDPipe) objectId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.attachments.authorize(objectType, objectId, user, 'EDIT');
    return this.attachments.remove(objectType, objectId, attachmentId, user.id);
  }

  private assertProjectAttachment(objectType: string) {
    if (objectType !== 'PROJECT') throw new BadRequestException('仅项目附件支持大文件分片上传');
  }
}
