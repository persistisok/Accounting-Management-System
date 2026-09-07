import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CreateDonationReceiptDto, DonationReceiptListQueryDto, UpdateDonationReceiptDto } from './donation-receipts.dto';
import { DonationReceiptsService } from './donation-receipts.service';

@Controller('donation-receipts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DonationReceiptsController {
  constructor(private readonly receipts: DonationReceiptsService) {}

  @Get()
  @RequirePermission('DONATION_RECEIPTS', 'VIEW')
  list(@Query() query: DonationReceiptListQueryDto, @CurrentUser() user: AuthUser) { return this.receipts.list(query, user); }

  @Post()
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM', 'EXTERNAL')
  @RequirePermission('DONATION_RECEIPTS', 'ENTRY')
  create(@Body() dto: CreateDonationReceiptDto, @CurrentUser() user: AuthUser) { return this.receipts.create(dto, user.id, user); }

  @Patch(':id')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('DONATION_RECEIPTS', 'EDIT')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDonationReceiptDto, @CurrentUser() user: AuthUser) {
    return this.receipts.update(id, dto, user.id, user);
  }

  @Post(':id/void')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('DONATION_RECEIPTS', 'EDIT')
  void(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.receipts.void(id, user.id, user); }
}
