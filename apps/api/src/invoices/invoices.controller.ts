import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CreateInvoiceDto, InvoiceListQueryDto } from './invoices.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  list(@Query() query: InvoiceListQueryDto) { return this.invoices.list(query); }

  @Post()
  @Roles('ADMIN', 'FINANCE')
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: AuthUser) { return this.invoices.create(dto, user.id); }

  @Post(':id/void')
  @Roles('ADMIN', 'FINANCE')
  void(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.invoices.void(id, user.id); }
}
