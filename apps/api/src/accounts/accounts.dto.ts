import { PermissionLevel, PermissionResource, RecordStatus, UserRole } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { ListQueryDto } from '../common/query.dto';

export class AccountListQueryDto extends ListQueryDto {
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus;
}

export class AccountPermissionDto {
  @IsEnum(PermissionResource) resource!: PermissionResource;
  @IsEnum(PermissionLevel) level!: PermissionLevel;
}

export class CreateAccountDto {
  @IsString() @MaxLength(64) username!: string;
  @IsString() @MinLength(8) @MaxLength(100) password!: string;
  @IsString() @MaxLength(100) displayName!: string;
  @IsEnum(UserRole) role!: UserRole;
  @Transform(({ value }) => value === '' ? null : value)
  @IsOptional() @IsUUID() projectManagerId?: string | null;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AccountPermissionDto)
  permissions?: AccountPermissionDto[];
  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) projectIds?: string[];
}

export class UpdateAccountDto {
  @IsOptional() @IsString() @MaxLength(64) username?: string;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(100) password?: string;
  @IsOptional() @IsString() @MaxLength(100) displayName?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @Transform(({ value }) => value === '' ? null : value)
  @IsOptional() @IsUUID() projectManagerId?: string | null;
  @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AccountPermissionDto)
  permissions?: AccountPermissionDto[];
  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) projectIds?: string[];
}
