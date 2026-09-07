import { DonationReceiptStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ListQueryDto } from '../common/query.dto';

export class DonationReceiptListQueryDto extends ListQueryDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() donorId?: string;
  @IsOptional() @IsEnum(DonationReceiptStatus) status?: DonationReceiptStatus;
  @IsOptional() @IsDateString() issuedFrom?: string;
  @IsOptional() @IsDateString() issuedTo?: string;
}

export class CreateDonationReceiptDto {
  @IsString() @MaxLength(64) receiptNumber!: string;
  @IsUUID() projectId!: string;
  @IsUUID() donorId!: string;
  @IsDateString() issuedOn!: string;
  @IsNumberString() amount!: string;
  @IsOptional() @IsString() @MaxLength(500) remark?: string;
}

export class UpdateDonationReceiptDto {
  @IsOptional() @IsString() @MaxLength(64) receiptNumber?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() donorId?: string;
  @IsOptional() @IsDateString() issuedOn?: string;
  @IsOptional() @IsNumberString() amount?: string;
  @IsOptional() @IsString() @MaxLength(500) remark?: string;
}
