import { InvoiceCategory, InvoiceCollectionStatus, InvoiceStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ListQueryDto } from '../common/query.dto';

export class InvoiceListQueryDto extends ListQueryDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() membershipId?: string;
  @IsOptional() @IsUUID() committeeId?: string;
  @IsOptional() @IsUUID() expertProfileId?: string;
  @IsOptional() @IsEnum(InvoiceStatus) status?: InvoiceStatus;
  @IsOptional() @IsEnum(InvoiceCategory) category?: InvoiceCategory;
  @IsOptional() @IsEnum(InvoiceCollectionStatus) collectionStatus?: InvoiceCollectionStatus;
  @IsOptional() @IsDateString() issuedFrom?: string;
  @IsOptional() @IsDateString() issuedTo?: string;
}

export class InvoiceCategoryQueryDto {
  @IsEnum(InvoiceCategory) category!: InvoiceCategory;
}

export class CreateInvoiceDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() membershipId?: string;
  @IsOptional() @IsUUID() expertProfileId?: string;
  @IsEnum(InvoiceCategory) category!: InvoiceCategory;
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
  @IsOptional() @IsUUID() projectId?: string | null;
  @IsOptional() @IsUUID() membershipId?: string;
  @IsOptional() @IsUUID() expertProfileId?: string;
  @IsOptional() @IsEnum(InvoiceCategory) category?: InvoiceCategory;
  @IsOptional() @IsDateString() issuedOn?: string;
  @IsOptional() @IsString() @MaxLength(30) invoiceType?: string;
  @IsOptional() @IsString() @MaxLength(100) invoicePlatform?: string;
  @IsOptional() @IsString() @MaxLength(200) buyerName?: string;
  @IsOptional() @IsNumberString() amountExcludingTax?: string;
  @IsOptional() @IsNumberString() taxRate?: string;
  @IsOptional() @IsNumberString() taxAmount?: string;
  @IsOptional() @IsNumberString() totalAmount?: string;
}

export class CollectMemberInvoiceDto {
  @IsUUID() membershipId!: string;
}
