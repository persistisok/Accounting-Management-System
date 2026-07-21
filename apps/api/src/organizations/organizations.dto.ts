import { OrganizationRoleType, SelectionStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ListQueryDto } from '../common/query.dto';

export class OrganizationListQueryDto extends ListQueryDto {
  @IsEnum(OrganizationRoleType)
  roleType!: OrganizationRoleType;
}

export class CreateOrganizationDto {
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(32) creditCode?: string;
  @IsString() @MaxLength(100) platform!: string;
  @IsUUID() ownerUserId!: string;
  @IsOptional() @IsString() @MaxLength(100) contactName?: string;
  @IsOptional() @IsString() @MaxLength(30) contactPhone?: string;
  @IsEnum(OrganizationRoleType) roleType!: OrganizationRoleType;
}

export class CreateCandidateDto {
  @IsUUID() projectId!: string;
  @IsUUID() organizationId!: string;
  @IsOptional() @IsEnum(SelectionStatus) selectionStatus?: SelectionStatus;
  @IsOptional() @IsString() @MaxLength(1000) remark?: string;
}
