import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { BankingService } from './banking.service';
import { BankAccountListQueryDto, CreateBankAccountDto, CreateTransactionDto, TransactionListQueryDto, UpdateBankAccountDto, UpdateTransactionDto } from './banking.dto';

@Controller('banking')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BankingController {
  constructor(private readonly banking: BankingService) {}

  @Get('accounts/options')
  accountOptions() { return this.banking.accountOptions(); }

  @Get('accounts')
  accounts(@Query() query: BankAccountListQueryDto) { return this.banking.accounts(query); }

  @Post('accounts')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  createAccount(@Body() dto: CreateBankAccountDto, @CurrentUser() user: AuthUser) {
    return this.banking.createAccount(dto, user.id);
  }

  @Patch('accounts/:id')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  updateAccount(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBankAccountDto, @CurrentUser() user: AuthUser) {
    return this.banking.updateAccount(id, dto, user.id);
  }

  @Delete('accounts/:id')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  removeAccount(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.banking.removeAccount(id, user.id);
  }

  @Get('transactions')
  list(@Query() query: TransactionListQueryDto) { return this.banking.list(query); }

  @Post('transactions')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  create(@Body() dto: CreateTransactionDto, @CurrentUser() user: AuthUser) {
    return this.banking.createTransaction(dto, user.id);
  }

  @Patch('transactions/:id')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTransactionDto, @CurrentUser() user: AuthUser) {
    return this.banking.updateTransaction(id, dto, user.id);
  }

  @Delete('transactions/:id')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  exclude(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.banking.excludeTransaction(id, user.id);
  }

}
