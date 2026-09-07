import { DonationReceiptStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ListQueryDto } from '../common/query.dto';

export class DonationReceiptListQueryDto extends ListQueryDto {
  @IsOptional() @IsEnum(DonationReceiptStatus) status?: DonationReceiptStatus;
  @IsOptional() @IsDateString() issuedFrom?: string;
  @IsOptional() @IsDateString() issuedTo?: string;
}

export class CreateDonationReceiptDto {
  @IsString() @MaxLength(200) donorName!: string;
  @IsString() @MaxLength(30) phone!: string;
  @IsDateString() issuedOn!: string;
  @IsString() @MaxLength(30) invoiceType!: string;
  @IsString() @MaxLength(100) invoicePlatform!: string;
  @IsString() @MaxLength(200) sellerName!: string;
  @IsNumberString() totalAmount!: string;
  @IsNumberString() taxRate!: string;
  @IsNumberString() amountExcludingTax!: string;
  @IsNumberString() taxAmount!: string;
}

export class UpdateDonationReceiptDto {
  @IsOptional() @IsString() @MaxLength(200) donorName?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsDateString() issuedOn?: string;
  @IsOptional() @IsString() @MaxLength(30) invoiceType?: string;
  @IsOptional() @IsString() @MaxLength(100) invoicePlatform?: string;
  @IsOptional() @IsString() @MaxLength(200) sellerName?: string;
  @IsOptional() @IsNumberString() totalAmount?: string;
  @IsOptional() @IsNumberString() taxRate?: string;
  @IsOptional() @IsNumberString() amountExcludingTax?: string;
  @IsOptional() @IsNumberString() taxAmount?: string;
}
