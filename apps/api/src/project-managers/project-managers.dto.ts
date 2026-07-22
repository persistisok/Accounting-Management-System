import { RecordStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ListQueryDto } from '../common/query.dto';

export class ProjectManagerListQueryDto extends ListQueryDto {
  @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus;
}

export class CreateProjectManagerDto {
  @IsString() @MaxLength(100) displayName!: string;
  @IsOptional() @IsString() @MaxLength(100) department?: string;
}

export class UpdateProjectManagerDto {
  @IsOptional() @IsString() @MaxLength(100) displayName?: string;
  @IsOptional() @IsString() @MaxLength(100) department?: string;
  @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus;
}
