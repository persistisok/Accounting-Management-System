import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RequirePermission } from '../auth/permissions';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { ListQueryDto } from '../common/query.dto';
import { CommitteeListQueryDto, CreateCommitteeDto, CreateMemberDueDto, CreateMembershipDto, MembershipListQueryDto, UpdateCommitteeDto, UpdateMemberDueDto, UpdateMembershipDto } from './memberships.dto';
import { MembershipsService } from './memberships.service';

@Controller('memberships')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  @RequirePermission('MEMBERS', 'VIEW')
  list(@Query() query: MembershipListQueryDto, @CurrentUser() user: AuthUser) { return this.memberships.list(query, user); }

  @Get(':id/dues')
  @RequirePermission('MEMBERS', 'VIEW')
  memberDues(@Param('id', ParseUUIDPipe) id: string, @Query() query: ListQueryDto, @CurrentUser() user: AuthUser) {
    return this.memberships.memberDues(id, query, user);
  }

  @Post()
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('MEMBERS', 'EDIT')
  create(@Body() dto: CreateMembershipDto, @CurrentUser() user: AuthUser) { return this.memberships.createMembership(dto, user.id, user); }

  @Patch(':id')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('MEMBERS', 'EDIT')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMembershipDto, @CurrentUser() user: AuthUser) {
    return this.memberships.updateMembership(id, dto, user.id, user);
  }

  @Delete(':id')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('MEMBERS', 'EDIT')
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.memberships.deactivateMembership(id, user.id, user);
  }

  @Get('committees')
  @RequirePermission('MEMBERS', 'VIEW')
  committees(@Query() query: CommitteeListQueryDto, @CurrentUser() user: AuthUser) { return this.memberships.committees(query, user); }

  @Get('committees/options')
  committeeOptions(@CurrentUser() user: AuthUser) { return this.memberships.committeeOptions(user); }

  @Post('committees')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('MEMBERS', 'EDIT')
  createCommittee(@Body() dto: CreateCommitteeDto, @CurrentUser() user: AuthUser) {
    return this.memberships.createCommittee(dto, user.id, user);
  }

  @Patch('committees/:id')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('MEMBERS', 'EDIT')
  updateCommittee(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCommitteeDto, @CurrentUser() user: AuthUser) {
    return this.memberships.updateCommittee(id, dto, user.id, user);
  }

  @Delete('committees/:id')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('MEMBERS', 'EDIT')
  deactivateCommittee(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.memberships.deactivateCommittee(id, user.id, user);
  }

  @Get('dues/options')
  dueOptions(@CurrentUser() user: AuthUser) { return this.memberships.dueOptions(user); }

  @Get('payments/options')
  paymentOptions(@CurrentUser() user: AuthUser) { return this.memberships.paymentOptions(user); }

  @Post('dues')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('MEMBERS', 'EDIT')
  createDue(@Body() dto: CreateMemberDueDto, @CurrentUser() user: AuthUser) {
    return this.memberships.createDue(dto, user.id, user);
  }

  @Patch('dues/:id')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('MEMBERS', 'EDIT')
  updateDue(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMemberDueDto, @CurrentUser() user: AuthUser) {
    return this.memberships.updateDue(id, dto, user.id, user);
  }

  @Delete('dues/:id')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('MEMBERS', 'EDIT')
  waiveDue(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.memberships.waiveDue(id, user.id, user);
  }
}
