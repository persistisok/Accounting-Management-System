import { OrganizationRoleType, RecordStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ListQueryDto } from '../common/query.dto';

export class OrganizationListQueryDto extends ListQueryDto {
  @IsEnum(OrganizationRoleType)
  roleType!: OrganizationRoleType;
}

export class CreateOrganizationDto {
  @IsString() @MaxLength(200) name!: string;
  @IsString() @MaxLength(100) platform!: string;
  @IsUUID() ownerUserId!: string;
  @IsOptional() @IsString() @MaxLength(100) contactName?: string;
  @IsOptional() @IsString() @MaxLength(30) contactPhone?: string;
  @IsEnum(OrganizationRoleType) roleType!: OrganizationRoleType;
}

export class UpdateOrganizationDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(100) platform?: string;
  @IsOptional() @IsUUID() ownerUserId?: string;
  @IsOptional() @IsString() @MaxLength(100) contactName?: string;
  @IsOptional() @IsString() @MaxLength(30) contactPhone?: string;
  @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus;
}
