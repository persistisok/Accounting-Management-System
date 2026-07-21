import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CreateCommitteeDto, CreateMemberDueDto, CreateMembershipDto, MembershipListQueryDto, UpdateCommitteeDto, UpdateMemberDueDto, UpdateMembershipDto } from './memberships.dto';
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

  @Patch(':id')
  @Roles('ADMIN', 'PM')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMembershipDto, @CurrentUser() user: AuthUser) {
    return this.memberships.updateMembership(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'PM')
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.memberships.deactivateMembership(id, user.id);
  }

  @Get('committees')
  committees() { return this.memberships.committees(); }

  @Post('committees')
  @Roles('ADMIN', 'PM')
  createCommittee(@Body() dto: CreateCommitteeDto, @CurrentUser() user: AuthUser) {
    return this.memberships.createCommittee(dto, user.id);
  }

  @Patch('committees/:id')
  @Roles('ADMIN', 'PM')
  updateCommittee(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCommitteeDto, @CurrentUser() user: AuthUser) {
    return this.memberships.updateCommittee(id, dto, user.id);
  }

  @Delete('committees/:id')
  @Roles('ADMIN')
  deactivateCommittee(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.memberships.deactivateCommittee(id, user.id);
  }

  @Get('dues/options')
  dueOptions() { return this.memberships.dueOptions(); }

  @Post('dues')
  @Roles('ADMIN', 'FINANCE')
  createDue(@Body() dto: CreateMemberDueDto, @CurrentUser() user: AuthUser) {
    return this.memberships.createDue(dto, user.id);
  }

  @Patch('dues/:id')
  @Roles('ADMIN', 'FINANCE')
  updateDue(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMemberDueDto, @CurrentUser() user: AuthUser) {
    return this.memberships.updateDue(id, dto, user.id);
  }

  @Delete('dues/:id')
  @Roles('ADMIN', 'FINANCE')
  waiveDue(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.memberships.waiveDue(id, user.id);
  }
}
