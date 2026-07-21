import { InvoiceKind, InvoiceStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ListQueryDto } from '../common/query.dto';

export class InvoiceListQueryDto extends ListQueryDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsEnum(InvoiceStatus) status?: InvoiceStatus;
}

export class CreateInvoiceDto {
  @IsOptional() @IsString() @MaxLength(32) invoiceCode?: string;
  @IsString() @MaxLength(64) invoiceNumber!: string;
  @IsUUID() projectId!: string;
  @IsDateString() issuedOn!: string;
  @IsString() @MaxLength(30) invoiceType!: string;
  @IsString() @MaxLength(100) invoicePlatform!: string;
  @IsString() @MaxLength(200) buyerName!: string;
  @IsNumberString() amountExcludingTax!: string;
  @IsNumberString() taxRate!: string;
  @IsNumberString() taxAmount!: string;
  @IsNumberString() totalAmount!: string;
  @IsOptional() @IsEnum(InvoiceKind) kind?: InvoiceKind;
  @IsOptional() @IsUUID() originalInvoiceId?: string;
}

export class UpdateInvoiceDto {
  @IsOptional() @IsString() @MaxLength(32) invoiceCode?: string;
  @IsOptional() @IsString() @MaxLength(64) invoiceNumber?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsDateString() issuedOn?: string;
  @IsOptional() @IsString() @MaxLength(30) invoiceType?: string;
  @IsOptional() @IsString() @MaxLength(100) invoicePlatform?: string;
  @IsOptional() @IsString() @MaxLength(200) buyerName?: string;
  @IsOptional() @IsNumberString() amountExcludingTax?: string;
  @IsOptional() @IsNumberString() taxRate?: string;
  @IsOptional() @IsNumberString() taxAmount?: string;
  @IsOptional() @IsNumberString() totalAmount?: string;
}
