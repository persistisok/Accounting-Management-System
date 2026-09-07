import { OrganizationRoleType, RecordStatus } from '@prisma/client';
import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ListQueryDto } from '../common/query.dto';

export class OrganizationListQueryDto extends ListQueryDto {
  @IsEnum(OrganizationRoleType)
  roleType!: OrganizationRoleType;
}

export class CreateOrganizationDto {
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(100) platform?: string;
  @IsOptional() @IsDateString() joinedOn?: string;
  @IsUUID() ownerUserId!: string;
  @IsOptional() @IsString() @MaxLength(100) contactName?: string;
  @IsOptional() @IsString() @MaxLength(30) contactPhone?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(3) @ArrayUnique() @IsUUID('4', { each: true }) serviceCapabilityIds?: string[];
  @IsOptional() @IsString() @MaxLength(200) otherCapabilityNote?: string;
  @IsEnum(OrganizationRoleType) roleType!: OrganizationRoleType;
}

export class UpdateOrganizationDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(100) platform?: string;
  @IsOptional() @IsDateString() joinedOn?: string;
  @IsOptional() @IsUUID() ownerUserId?: string;
  @IsOptional() @IsString() @MaxLength(100) contactName?: string;
  @IsOptional() @IsString() @MaxLength(30) contactPhone?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(3) @ArrayUnique() @IsUUID('4', { each: true }) serviceCapabilityIds?: string[];
  @IsOptional() @IsString() @MaxLength(200) otherCapabilityNote?: string;
  @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus;
}

export class CreateServiceCapabilityDto {
  @IsString() @MaxLength(100) name!: string;
}

export class UpdateServiceCapabilityDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus;
}

export class ReorderServiceCapabilitiesDto {
  @IsArray() @ArrayNotEmpty() @ArrayUnique() @IsUUID('4', { each: true }) ids!: string[];
}
