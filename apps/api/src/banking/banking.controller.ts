import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RequirePermission } from '../auth/permissions';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { BankingImportFile, BankingService } from './banking.service';
import { BankAccountListQueryDto, CreateBankAccountDto, CreateTransactionDto, TransactionListQueryDto, UpdateBankAccountDto, UpdateTransactionDto } from './banking.dto';

@Controller('banking')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BankingController {
  constructor(private readonly banking: BankingService) {}

  @Get('accounts/options')
  accountOptions() { return this.banking.accountOptions(); }

  @Get('accounts')
  @RequirePermission('BANKING', 'VIEW')
  accounts(@Query() query: BankAccountListQueryDto) { return this.banking.accounts(query); }

  @Post('accounts')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  @RequirePermission('BANKING', 'EDIT')
  createAccount(@Body() dto: CreateBankAccountDto, @CurrentUser() user: AuthUser) {
    return this.banking.createAccount(dto, user.id);
  }

  @Patch('accounts/:id')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  @RequirePermission('BANKING', 'EDIT')
  updateAccount(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBankAccountDto, @CurrentUser() user: AuthUser) {
    return this.banking.updateAccount(id, dto, user.id);
  }

  @Delete('accounts/:id')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  @RequirePermission('BANKING', 'EDIT')
  removeAccount(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.banking.removeAccount(id, user.id);
  }

  @Get('transactions')
  @RequirePermission('BANKING', 'VIEW')
  list(@Query() query: TransactionListQueryDto, @CurrentUser() user: AuthUser) { return this.banking.list(query, user); }

  @Get('transactions/import-template')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('BANKING', 'EDIT')
  importTemplate() {
    return new StreamableFile(this.banking.importTemplate(), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent('银行日记账导入模板.csv')}`,
    });
  }

  @Post('transactions/import')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('BANKING', 'EDIT')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  importTransactions(@UploadedFile() file: BankingImportFile | undefined, @CurrentUser() user: AuthUser) {
    if (!file) throw new BadRequestException('请选择 CSV 导入文件');
    return this.banking.importTransactions(file, user);
  }

  @Post('transactions')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('BANKING', 'EDIT')
  create(@Body() dto: CreateTransactionDto, @CurrentUser() user: AuthUser) {
    return this.banking.createTransaction(dto, user.id, user);
  }

  @Patch('transactions/:id')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('BANKING', 'EDIT')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTransactionDto, @CurrentUser() user: AuthUser) {
    return this.banking.updateTransaction(id, dto, user.id, user);
  }

  @Delete('transactions/:id')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('BANKING', 'EDIT')
  exclude(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.banking.excludeTransaction(id, user.id, user);
  }

}
