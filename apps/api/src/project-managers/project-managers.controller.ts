import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CreateProjectManagerDto, ProjectManagerListQueryDto, UpdateProjectManagerDto } from './project-managers.dto';
import { ProjectManagersService } from './project-managers.service';

@Controller('project-managers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectManagersController {
  constructor(private readonly projectManagers: ProjectManagersService) {}

  @Get('options')
  options(@CurrentUser() user: AuthUser) { return this.projectManagers.options(user); }

  @Get()
  @Roles('SYSTEM_ADMIN')
  list(@Query() query: ProjectManagerListQueryDto) { return this.projectManagers.list(query); }

  @Post()
  @Roles('SYSTEM_ADMIN')
  create(@Body() dto: CreateProjectManagerDto, @CurrentUser() user: AuthUser) {
    return this.projectManagers.create(dto, user.id);
  }

  @Patch(':id')
  @Roles('SYSTEM_ADMIN')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProjectManagerDto, @CurrentUser() user: AuthUser) {
    return this.projectManagers.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('SYSTEM_ADMIN')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.projectManagers.remove(id, user.id);
  }
}
