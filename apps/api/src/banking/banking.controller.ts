import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { BankingService } from './banking.service';
import { CreateAllocationDto, CreateTransactionDto, TransactionListQueryDto, UpdateTransactionDto } from './banking.dto';

@Controller('banking')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BankingController {
  constructor(private readonly banking: BankingService) {}

  @Get('accounts')
  accounts() { return this.banking.accounts(); }

  @Get('transactions')
  list(@Query() query: TransactionListQueryDto) { return this.banking.list(query); }

  @Post('transactions')
  @Roles('ADMIN', 'FINANCE')
  create(@Body() dto: CreateTransactionDto, @CurrentUser() user: AuthUser) {
    return this.banking.createTransaction(dto, user.id);
  }

  @Patch('transactions/:id')
  @Roles('ADMIN', 'FINANCE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTransactionDto, @CurrentUser() user: AuthUser) {
    return this.banking.updateTransaction(id, dto, user.id);
  }

  @Delete('transactions/:id')
  @Roles('ADMIN', 'FINANCE')
  exclude(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.banking.excludeTransaction(id, user.id);
  }

  @Post('transactions/:id/allocations')
  @Roles('ADMIN', 'FINANCE')
  allocate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateAllocationDto, @CurrentUser() user: AuthUser) {
    return this.banking.allocate(id, dto, user.id);
  }

  @Post('allocations/:id/reverse')
  @Roles('ADMIN', 'FINANCE')
  reverse(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.banking.reverse(id, user.id);
  }
}
