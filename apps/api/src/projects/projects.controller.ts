import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CreateProjectDto, ProjectListQueryDto, UpdateProjectDto } from './projects.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@Query() query: ProjectListQueryDto) { return this.projects.list(query); }

  @Get('options')
  options() { return this.projects.options(); }

  @Post()
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: AuthUser) {
    return this.projects.create(dto, user.id);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.projects.findOne(id); }

  @Patch(':id')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProjectDto, @CurrentUser() user: AuthUser) {
    return this.projects.update(id, dto, user.id);
  }

  @Get(':id/financial-summary')
  summary(@Param('id', ParseUUIDPipe) id: string) { return this.projects.summary(id); }

  @Get(':id/timeline')
  timeline(@Param('id', ParseUUIDPipe) id: string) { return this.projects.timeline(id); }
}
