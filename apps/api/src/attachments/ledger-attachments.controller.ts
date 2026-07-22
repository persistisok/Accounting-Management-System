import { BadRequestException, Controller, Delete, Get, Param, ParseUUIDPipe, Post, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { LedgerAttachmentFile, LedgerAttachmentsService } from './ledger-attachments.service';

@Controller('attachments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LedgerAttachmentsController {
  constructor(private readonly attachments: LedgerAttachmentsService) {}

  @Get(':objectType/:objectId')
  list(
    @Param('objectType') objectType: string,
    @Param('objectId', ParseUUIDPipe) objectId: string,
  ) {
    return this.attachments.list(objectType, objectId);
  }

  @Post(':objectType/:objectId')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  upload(
    @Param('objectType') objectType: string,
    @Param('objectId', ParseUUIDPipe) objectId: string,
    @UploadedFile() file: LedgerAttachmentFile | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('请选择需要上传的 PDF 附件');
    return this.attachments.upload(objectType, objectId, file, user.id);
  }

  @Get(':objectType/:objectId/:attachmentId/download')
  async download(
    @Param('objectType') objectType: string,
    @Param('objectId', ParseUUIDPipe) objectId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const { stream, attachment } = await this.attachments.download(objectType, objectId, attachmentId, user.id);
    return new StreamableFile(stream, {
      type: attachment.contentType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      length: Number(attachment.sizeBytes),
    });
  }

  @Delete(':objectType/:objectId/:attachmentId')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  remove(
    @Param('objectType') objectType: string,
    @Param('objectId', ParseUUIDPipe) objectId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attachments.remove(objectType, objectId, attachmentId, user.id);
  }
}
