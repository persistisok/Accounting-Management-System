import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CreateExpertDto, ExpertListQueryDto, ReviewExpertDto } from './experts.dto';
import { ExpertsService } from './experts.service';

@Controller('experts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExpertsController {
  constructor(private readonly experts: ExpertsService) {}

  @Get()
  list(@Query() query: ExpertListQueryDto) { return this.experts.list(query); }

  @Get('options')
  options() { return this.experts.options(); }

  @Post()
  @Roles('ADMIN', 'PM')
  create(@Body() dto: CreateExpertDto, @CurrentUser() user: AuthUser) { return this.experts.create(dto, user.id); }

  @Post(':id/review')
  @Roles('ADMIN', 'REVIEWER', 'COMPLIANCE')
  review(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewExpertDto, @CurrentUser() user: AuthUser) {
    return this.experts.review(id, dto, user.id);
  }
}
