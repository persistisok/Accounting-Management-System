import { AllocationCategory, RecordStatus, TransactionDirection } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ListQueryDto } from '../common/query.dto';

export class TransactionListQueryDto extends ListQueryDto {
  @IsOptional() @IsEnum(TransactionDirection) direction?: TransactionDirection;
  @IsOptional() @IsString() matchStatus?: string;
}

export class BankAccountListQueryDto extends ListQueryDto {}

export class CreateBankAccountDto {
  @IsString() @MaxLength(200) bankName!: string;
  @IsString() @MaxLength(64) accountNumber!: string;
}

export class UpdateBankAccountDto {
  @IsOptional() @IsString() @MaxLength(200) bankName?: string;
  @IsOptional() @IsString() @MaxLength(64) accountNumber?: string;
  @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus;
}

export class CreateTransactionDto {
  @IsUUID() bankAccountId!: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() expertProfileId?: string;
  @IsOptional() @IsUUID() membershipId?: string;
  @IsIn(['SUPPORT_RECEIPT', 'MEMBER_DUE', 'EXECUTION_PAYMENT', 'EXPERT_FEE']) category!: AllocationCategory;
  @IsDateString() transactionAt!: string;
  @IsString() @MaxLength(200) counterpartyName!: string;
  @IsString() @MaxLength(200) counterpartyBankName!: string;
  @IsString() @MaxLength(64) counterpartyAccountNumber!: string;
  @IsEnum(TransactionDirection) direction!: TransactionDirection;
  @IsNumberString() amount!: string;
  @IsString() @MaxLength(100) nature!: string;
}

export class UpdateTransactionDto {
  @IsOptional() @IsUUID() bankAccountId?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() expertProfileId?: string;
  @IsOptional() @IsUUID() membershipId?: string;
  @IsOptional() @IsIn(['SUPPORT_RECEIPT', 'MEMBER_DUE', 'EXECUTION_PAYMENT', 'EXPERT_FEE']) category?: AllocationCategory;
  @IsOptional() @IsDateString() transactionAt?: string;
  @IsOptional() @IsString() @MaxLength(200) counterpartyName?: string;
  @IsOptional() @IsString() @MaxLength(200) counterpartyBankName?: string;
  @IsOptional() @IsString() @MaxLength(64) counterpartyAccountNumber?: string;
  @IsOptional() @IsEnum(TransactionDirection) direction?: TransactionDirection;
  @IsOptional() @IsNumberString() amount?: string;
  @IsOptional() @IsString() @MaxLength(100) nature?: string;
}
