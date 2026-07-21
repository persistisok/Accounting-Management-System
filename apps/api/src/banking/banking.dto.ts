import { AllocationCategory, SourceType, TransactionDirection } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ListQueryDto } from '../common/query.dto';

export class TransactionListQueryDto extends ListQueryDto {
  @IsOptional() @IsEnum(TransactionDirection) direction?: TransactionDirection;
  @IsOptional() @IsString() matchStatus?: string;
}

export class CreateTransactionDto {
  @IsUUID() bankAccountId!: string;
  @IsOptional() @IsString() @MaxLength(100) transactionNo?: string;
  @IsDateString() transactionAt!: string;
  @IsString() @MaxLength(200) counterpartyName!: string;
  @IsEnum(TransactionDirection) direction!: TransactionDirection;
  @IsNumberString() amount!: string;
  @IsString() @MaxLength(100) nature!: string;
  @IsOptional() @IsBoolean() settlementApplicable?: boolean;
  @IsOptional() @IsEnum(SourceType) sourceType?: SourceType;
}

export class CreateAllocationDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() memberDueId?: string;
  @IsOptional() @IsUUID() expertProfileId?: string;
  @IsEnum(AllocationCategory) category!: AllocationCategory;
  @IsNumberString() allocatedAmount!: string;
}
