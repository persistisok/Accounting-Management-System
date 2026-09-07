import { BadRequestException, Body, Controller, Delete, Get, Param, ParseEnumPipe, ParseUUIDPipe, Patch, Post, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OrganizationRoleType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { assertPermission } from '../auth/permissions';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CreateOrganizationDto, CreateServiceCapabilityDto, OrganizationListQueryDto, ReorderServiceCapabilitiesDto, UpdateOrganizationDto, UpdateServiceCapabilityDto } from './organizations.dto';
import { OrganizationDocumentFile, OrganizationDocumentsService } from './organization-documents.service';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService, private readonly documents: OrganizationDocumentsService) {}

  @Get()
  list(@Query() query: OrganizationListQueryDto, @CurrentUser() user: AuthUser) {
    assertPermission(user, organizationResource(query.roleType), 'VIEW');
    return this.organizations.list(query, user);
  }

  @Get('options')
  options(@Query('roleType') roleType: OrganizationRoleType | undefined, @CurrentUser() user: AuthUser) { return this.organizations.options(roleType, user); }

  @Get('service-capabilities')
  serviceCapabilities(@CurrentUser() user: AuthUser) {
    assertPermission(user, 'EXECUTORS', 'VIEW');
    return this.organizations.serviceCapabilities();
  }

  @Post('service-capabilities')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  createServiceCapability(@Body() dto: CreateServiceCapabilityDto, @CurrentUser() user: AuthUser) {
    assertPermission(user, 'EXECUTORS', 'EDIT');
    return this.organizations.createServiceCapability(dto, user.id);
  }

  @Patch('service-capabilities/order')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  reorderServiceCapabilities(@Body() dto: ReorderServiceCapabilitiesDto, @CurrentUser() user: AuthUser) {
    assertPermission(user, 'EXECUTORS', 'EDIT');
    return this.organizations.reorderServiceCapabilities(dto, user.id);
  }

  @Patch('service-capabilities/:capabilityId')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  updateServiceCapability(@Param('capabilityId', ParseUUIDPipe) id: string, @Body() dto: UpdateServiceCapabilityDto, @CurrentUser() user: AuthUser) {
    assertPermission(user, 'EXECUTORS', 'EDIT');
    return this.organizations.updateServiceCapability(id, dto, user.id);
  }

  @Delete('service-capabilities/:capabilityId')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  deleteServiceCapability(@Param('capabilityId', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    assertPermission(user, 'EXECUTORS', 'EDIT');
    return this.organizations.deleteServiceCapability(id, user.id);
  }

  @Post()
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM', 'EXTERNAL')
  create(@Body() dto: CreateOrganizationDto, @CurrentUser() user: AuthUser) {
    assertPermission(user, organizationResource(dto.roleType), 'ENTRY');
    return this.organizations.create(dto, user.id, user);
  }

  @Patch(':id')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  update(@Param('id', ParseUUIDPipe) id: string, @Query('roleType', new ParseEnumPipe(OrganizationRoleType)) roleType: OrganizationRoleType, @Body() dto: UpdateOrganizationDto, @CurrentUser() user: AuthUser) {
    assertPermission(user, organizationResource(roleType), 'EDIT');
    return this.organizations.update(id, roleType, dto, user.id, user);
  }

  @Delete(':id')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  deactivate(@Param('id', ParseUUIDPipe) id: string, @Query('roleType', new ParseEnumPipe(OrganizationRoleType)) roleType: OrganizationRoleType, @CurrentUser() user: AuthUser) {
    assertPermission(user, organizationResource(roleType), 'EDIT');
    return this.organizations.deactivate(id, user.id, user);
  }

  @Post(':id/documents/:documentType')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM', 'EXTERNAL')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async uploadDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentType') documentType: string,
    @UploadedFile() file: OrganizationDocumentFile | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    assertPermission(user, 'EXECUTORS', 'ENTRY');
    if (!file) throw new BadRequestException('请选择需要上传的执行方材料');
    await this.organizations.assertScope(id, 'EXECUTOR', user);
    return this.documents.upload(id, documentType, file, user.id);
  }

  @Get(':id/documents/:attachmentId')
  async downloadDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    assertPermission(user, 'EXECUTORS', 'VIEW');
    await this.organizations.assertScope(id, 'EXECUTOR', user);
    const { stream, attachment } = await this.documents.download(id, attachmentId, user.id);
    return new StreamableFile(stream, {
      type: attachment.contentType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      length: Number(attachment.sizeBytes),
    });
  }

  @Delete(':id/documents/:attachmentId')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  async removeDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    assertPermission(user, 'EXECUTORS', 'EDIT');
    await this.organizations.assertScope(id, 'EXECUTOR', user);
    return this.documents.remove(id, attachmentId, user.id);
  }
}

function organizationResource(roleType: OrganizationRoleType | undefined) {
  return roleType === 'EXECUTOR' ? 'EXECUTORS' as const : 'SUPPORTERS' as const;
}
