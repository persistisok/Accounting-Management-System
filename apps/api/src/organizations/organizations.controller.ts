import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { OrganizationRoleType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CreateCandidateDto, CreateOrganizationDto, OrganizationListQueryDto, UpdateCandidateDto, UpdateOrganizationDto } from './organizations.dto';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  list(@Query() query: OrganizationListQueryDto) { return this.organizations.list(query); }

  @Get('options')
  options(@Query('roleType') roleType?: OrganizationRoleType) { return this.organizations.options(roleType); }

  @Post()
  @Roles('ADMIN', 'PM', 'COMPLIANCE')
  create(@Body() dto: CreateOrganizationDto, @CurrentUser() user: AuthUser) {
    return this.organizations.create(dto, user.id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'PM', 'COMPLIANCE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrganizationDto, @CurrentUser() user: AuthUser) {
    return this.organizations.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'COMPLIANCE')
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.organizations.deactivate(id, user.id);
  }

  @Post('executor-candidates')
  @Roles('ADMIN', 'PM', 'COMPLIANCE')
  addCandidate(@Body() dto: CreateCandidateDto, @CurrentUser() user: AuthUser) {
    return this.organizations.addCandidate(dto, user.id);
  }

  @Patch('executor-candidates/:id')
  @Roles('ADMIN', 'PM', 'COMPLIANCE')
  updateCandidate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCandidateDto, @CurrentUser() user: AuthUser) {
    return this.organizations.updateCandidate(id, dto, user.id);
  }

  @Delete('executor-candidates/:id')
  @Roles('ADMIN', 'PM', 'COMPLIANCE')
  withdrawCandidate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.organizations.withdrawCandidate(id, user.id);
  }
}
