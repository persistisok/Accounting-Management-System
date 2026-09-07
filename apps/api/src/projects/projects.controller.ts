import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RequirePermission } from '../auth/permissions';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CreateProjectDto, ProjectListQueryDto, RequestProjectStatusDto, ReviewProjectChangeDto, UpdateProjectDto } from './projects.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @RequirePermission('PROJECTS', 'VIEW')
  list(@Query() query: ProjectListQueryDto, @CurrentUser() user: AuthUser) { return this.projects.list(query, user); }

  @Get('options')
  options(@CurrentUser() user: AuthUser) { return this.projects.options(user); }

  @Get('filter-options')
  @RequirePermission('PROJECTS', 'VIEW')
  filterOptions(@CurrentUser() user: AuthUser) { return this.projects.filterOptions(user); }

  @Post()
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('PROJECTS', 'ENTRY')
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: AuthUser) {
    return this.projects.create(dto, user.id, user);
  }

  @Get(':id')
  @RequirePermission('PROJECTS', 'VIEW')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.projects.findOne(id, user); }

  @Patch(':id')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('PROJECTS', 'EDIT')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProjectDto, @CurrentUser() user: AuthUser) {
    return this.projects.update(id, dto, user.id, user);
  }

  @Delete(':id')
  @Roles('SYSTEM_ADMIN')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.projects.remove(id, user.id);
  }

  @Post(':id/status-request')
  @Roles('PM')
  @RequirePermission('PROJECTS', 'VIEW')
  requestStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RequestProjectStatusDto, @CurrentUser() user: AuthUser) {
    return this.projects.requestStatus(id, dto.status, user);
  }

  @Post(':id/status-review')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  @RequirePermission('PROJECTS', 'REVIEW')
  reviewStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewProjectChangeDto, @CurrentUser() user: AuthUser) {
    return this.projects.reviewStatus(id, dto.decision, user.id);
  }

  @Post(':id/archive-request')
  @Roles('PM')
  @RequirePermission('PROJECTS', 'VIEW')
  requestArchive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.projects.requestArchive(id, user);
  }

  @Post(':id/archive-review')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  @RequirePermission('PROJECTS', 'REVIEW')
  reviewArchive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewProjectChangeDto, @CurrentUser() user: AuthUser) {
    return this.projects.reviewArchive(id, dto.decision, user.id);
  }

  @Get(':id/financial-summary')
  @RequirePermission('PROJECTS', 'VIEW')
  summary(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.projects.summary(id, user); }

  @Get(':id/timeline')
  @RequirePermission('PROJECTS', 'VIEW')
  timeline(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.projects.timeline(id, user); }
}
