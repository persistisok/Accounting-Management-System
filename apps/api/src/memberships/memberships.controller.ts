import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CreateCommitteeDto, CreateMemberDueDto, CreateMembershipDto, MembershipListQueryDto } from './memberships.dto';
import { MembershipsService } from './memberships.service';

@Controller('memberships')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  list(@Query() query: MembershipListQueryDto) { return this.memberships.list(query); }

  @Post()
  @Roles('ADMIN', 'PM')
  create(@Body() dto: CreateMembershipDto, @CurrentUser() user: AuthUser) { return this.memberships.createMembership(dto, user.id); }

  @Get('committees')
  committees() { return this.memberships.committees(); }

  @Post('committees')
  @Roles('ADMIN', 'PM')
  createCommittee(@Body() dto: CreateCommitteeDto, @CurrentUser() user: AuthUser) {
    return this.memberships.createCommittee(dto, user.id);
  }

  @Get('dues/options')
  dueOptions() { return this.memberships.dueOptions(); }

  @Post('dues')
  @Roles('ADMIN', 'FINANCE')
  createDue(@Body() dto: CreateMemberDueDto, @CurrentUser() user: AuthUser) {
    return this.memberships.createDue(dto, user.id);
  }
}
