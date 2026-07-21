import { RecordStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ListQueryDto } from '../common/query.dto';

export class ProjectManagerListQueryDto extends ListQueryDto {
  @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus;
}

export class CreateProjectManagerDto {
  @IsString() @MinLength(3) @MaxLength(64) username!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
  @IsString() @MaxLength(100) displayName!: string;
  @IsOptional() @IsString() @MaxLength(100) department?: string;
}

export class UpdateProjectManagerDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(64) username?: string;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(128) password?: string;
  @IsOptional() @IsString() @MaxLength(100) displayName?: string;
  @IsOptional() @IsString() @MaxLength(100) department?: string;
  @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus;
}
