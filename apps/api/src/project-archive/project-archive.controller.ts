import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { RequirePermission } from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { MarkArchiveItemNotApplicableDto, ReviewArchiveItemDto } from './project-archive.dto';
import { ProjectArchiveService } from './project-archive.service';

@Controller('projects/:projectId/archive-checklist')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectArchiveController {
  constructor(private readonly archive: ProjectArchiveService) {}

  @Get()
  @RequirePermission('PROJECTS', 'VIEW')
  list(@Param('projectId', ParseUUIDPipe) projectId: string, @CurrentUser() user: AuthUser) {
    return this.archive.list(projectId, user);
  }

  @Post(':itemKey/prepare')
  @Roles('SYSTEM_ADMIN', 'PM')
  @RequirePermission('PROJECTS', 'ENTRY')
  prepare(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('itemKey') itemKey: string, @CurrentUser() user: AuthUser) {
    return this.archive.prepare(projectId, itemKey, user);
  }

  @Post(':itemKey/submit')
  @Roles('SYSTEM_ADMIN', 'PM')
  @RequirePermission('PROJECTS', 'ENTRY')
  submit(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('itemKey') itemKey: string, @CurrentUser() user: AuthUser) {
    return this.archive.submit(projectId, itemKey, user);
  }

  @Post(':itemKey/not-applicable')
  @Roles('SYSTEM_ADMIN', 'PM')
  @RequirePermission('PROJECTS', 'ENTRY')
  markNotApplicable(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('itemKey') itemKey: string, @Body() dto: MarkArchiveItemNotApplicableDto, @CurrentUser() user: AuthUser) {
    return this.archive.markNotApplicable(projectId, itemKey, dto.reason, user);
  }

  @Post(':itemKey/review')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  @RequirePermission('PROJECTS', 'REVIEW')
  review(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('itemKey') itemKey: string, @Body() dto: ReviewArchiveItemDto, @CurrentUser() user: AuthUser) {
    return this.archive.review(projectId, itemKey, dto.decision, dto.reason, user);
  }
}
