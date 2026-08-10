import { Body, Controller, Delete, Get, Param, ParseEnumPipe, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { OrganizationRoleType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { assertPermission } from '../auth/permissions';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CreateOrganizationDto, OrganizationListQueryDto, UpdateOrganizationDto } from './organizations.dto';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  list(@Query() query: OrganizationListQueryDto, @CurrentUser() user: AuthUser) {
    assertPermission(user, organizationResource(query.roleType), 'VIEW');
    return this.organizations.list(query, user);
  }

  @Get('options')
  options(@Query('roleType') roleType: OrganizationRoleType | undefined, @CurrentUser() user: AuthUser) { return this.organizations.options(roleType, user); }

  @Post()
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  create(@Body() dto: CreateOrganizationDto, @CurrentUser() user: AuthUser) {
    assertPermission(user, organizationResource(dto.roleType), 'EDIT');
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
}

function organizationResource(roleType: OrganizationRoleType | undefined) {
  return roleType === 'EXECUTOR' ? 'EXECUTORS' as const : 'SUPPORTERS' as const;
}
