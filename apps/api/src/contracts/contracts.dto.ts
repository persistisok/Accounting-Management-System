import { ContractDirection, ContractStatus, ContractType } from '@prisma/client';
import { IsDateString, IsEnum, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ListQueryDto } from '../common/query.dto';

export class ContractListQueryDto extends ListQueryDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsEnum(ContractType) contractType?: ContractType;
  @IsOptional() @IsEnum(ContractStatus) status?: ContractStatus;
}

export class CreateContractDto {
  @IsString() @MaxLength(64) contractNo!: string;
  @IsUUID() projectId!: string;
  @IsEnum(ContractDirection) contractDirection!: ContractDirection;
  @IsEnum(ContractType) contractType!: ContractType;
  @IsString() @MaxLength(200) contractEntity!: string;
  @IsUUID() counterpartyId!: string;
  @IsNumberString() amount!: string;
  @IsDateString() signedOn!: string;
  @IsOptional() @IsDateString() effectiveOn?: string;
  @IsOptional() @IsDateString() expiresOn?: string;
  @IsOptional() @IsEnum(ContractStatus) status?: ContractStatus;
  @IsOptional() @IsUUID() parentContractId?: string;
  @IsOptional() @IsString() @MaxLength(1000) remark?: string;
}
