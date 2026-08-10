import { InvoiceDirection, InvoiceStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ListQueryDto } from '../common/query.dto';

export class InvoiceListQueryDto extends ListQueryDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsEnum(InvoiceStatus) status?: InvoiceStatus;
  @IsOptional() @IsEnum(InvoiceDirection) direction?: InvoiceDirection;
}

export class CreateInvoiceDto {
  @IsUUID() projectId!: string;
  @IsEnum(InvoiceDirection) direction!: InvoiceDirection;
  @IsDateString() issuedOn!: string;
  @IsString() @MaxLength(30) invoiceType!: string;
  @IsString() @MaxLength(100) invoicePlatform!: string;
  @IsString() @MaxLength(200) buyerName!: string;
  @IsNumberString() amountExcludingTax!: string;
  @IsNumberString() taxRate!: string;
  @IsNumberString() taxAmount!: string;
  @IsNumberString() totalAmount!: string;
}

export class UpdateInvoiceDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsEnum(InvoiceDirection) direction?: InvoiceDirection;
  @IsOptional() @IsDateString() issuedOn?: string;
  @IsOptional() @IsString() @MaxLength(30) invoiceType?: string;
  @IsOptional() @IsString() @MaxLength(100) invoicePlatform?: string;
  @IsOptional() @IsString() @MaxLength(200) buyerName?: string;
  @IsOptional() @IsNumberString() amountExcludingTax?: string;
  @IsOptional() @IsNumberString() taxRate?: string;
  @IsOptional() @IsNumberString() taxAmount?: string;
  @IsOptional() @IsNumberString() totalAmount?: string;
}
