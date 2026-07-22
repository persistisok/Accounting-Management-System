import { ContractStatus, ContractType } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ListQueryDto } from '../common/query.dto';

export class ContractListQueryDto extends ListQueryDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsEnum(ContractStatus) status?: ContractStatus;
}

export class CreateContractDto {
  @IsUUID() projectId!: string;
  @IsIn([ContractType.SUPPORT, ContractType.EXECUTION]) contractType!: ContractType;
  @IsString() @MaxLength(200) contractEntity!: string;
  @IsUUID() counterpartyId!: string;
  @IsNumberString() amount!: string;
  @IsDateString() signedOn!: string;
}

export class UpdateContractDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsIn([ContractType.SUPPORT, ContractType.EXECUTION]) contractType?: ContractType;
  @IsOptional() @IsString() @MaxLength(200) contractEntity?: string;
  @IsOptional() @IsUUID() counterpartyId?: string;
  @IsOptional() @IsNumberString() amount?: string;
  @IsOptional() @IsDateString() signedOn?: string;
}
