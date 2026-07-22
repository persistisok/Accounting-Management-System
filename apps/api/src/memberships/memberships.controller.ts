import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { ListQueryDto } from '../common/query.dto';
import { CommitteeListQueryDto, CreateCommitteeDto, CreateMemberDueDto, CreateMembershipDto, MembershipListQueryDto, UpdateCommitteeDto, UpdateMemberDueDto, UpdateMembershipDto } from './memberships.dto';
import { MembershipsService } from './memberships.service';

@Controller('memberships')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  list(@Query() query: MembershipListQueryDto) { return this.memberships.list(query); }

  @Get(':id/dues')
  memberDues(@Param('id', ParseUUIDPipe) id: string, @Query() query: ListQueryDto) {
    return this.memberships.memberDues(id, query);
  }

  @Post()
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  create(@Body() dto: CreateMembershipDto, @CurrentUser() user: AuthUser) { return this.memberships.createMembership(dto, user.id); }

  @Patch(':id')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMembershipDto, @CurrentUser() user: AuthUser) {
    return this.memberships.updateMembership(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.memberships.deactivateMembership(id, user.id);
  }

  @Get('committees')
  committees(@Query() query: CommitteeListQueryDto) { return this.memberships.committees(query); }

  @Get('committees/options')
  committeeOptions() { return this.memberships.committeeOptions(); }

  @Post('committees')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  createCommittee(@Body() dto: CreateCommitteeDto, @CurrentUser() user: AuthUser) {
    return this.memberships.createCommittee(dto, user.id);
  }

  @Patch('committees/:id')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  updateCommittee(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCommitteeDto, @CurrentUser() user: AuthUser) {
    return this.memberships.updateCommittee(id, dto, user.id);
  }

  @Delete('committees/:id')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  deactivateCommittee(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.memberships.deactivateCommittee(id, user.id);
  }

  @Get('dues/options')
  dueOptions() { return this.memberships.dueOptions(); }

  @Get('payments/options')
  paymentOptions() { return this.memberships.paymentOptions(); }

  @Post('dues')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  createDue(@Body() dto: CreateMemberDueDto, @CurrentUser() user: AuthUser) {
    return this.memberships.createDue(dto, user.id);
  }

  @Patch('dues/:id')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  updateDue(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMemberDueDto, @CurrentUser() user: AuthUser) {
    return this.memberships.updateDue(id, dto, user.id);
  }

  @Delete('dues/:id')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  waiveDue(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.memberships.waiveDue(id, user.id);
  }
}
