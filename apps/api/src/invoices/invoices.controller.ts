import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RequirePermission } from '../auth/permissions';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CreateInvoiceDto, InvoiceListQueryDto, UpdateInvoiceDto } from './invoices.dto';
import { InvoiceImportFile, InvoicesService } from './invoices.service';

@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @RequirePermission('INVOICES', 'VIEW')
  list(@Query() query: InvoiceListQueryDto, @CurrentUser() user: AuthUser) { return this.invoices.list(query, user); }

  @Get('import-template')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('INVOICES', 'EDIT')
  importTemplate() {
    return new StreamableFile(this.invoices.importTemplate(), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent('发票台账导入模板.csv')}`,
    });
  }

  @Post('import')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('INVOICES', 'EDIT')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  importInvoices(@UploadedFile() file: InvoiceImportFile | undefined, @CurrentUser() user: AuthUser) {
    if (!file) throw new BadRequestException('请选择 CSV 导入文件');
    return this.invoices.importInvoices(file, user);
  }

  @Post()
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('INVOICES', 'EDIT')
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: AuthUser) { return this.invoices.create(dto, user.id, user); }

  @Patch(':id')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('INVOICES', 'EDIT')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.invoices.update(id, dto, user.id, user);
  }

  @Post(':id/void')
  @Roles('SYSTEM_ADMIN', 'ADMIN', 'PM')
  @RequirePermission('INVOICES', 'EDIT')
  void(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.invoices.void(id, user.id, user); }
}
