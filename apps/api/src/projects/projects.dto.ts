import { ProjectStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ListQueryDto } from '../common/query.dto';

export enum ProjectPeriodUnit {
  MONTH = 'MONTH',
  YEAR = 'YEAR',
}

export class ProjectListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}

export class CreateProjectDto {
  @IsString() @MaxLength(100) platform!: string;
  @IsDateString() publishedOn!: string;
  @IsString() @MaxLength(200) name!: string;
  @IsString() @MaxLength(50) nature!: string;
  @IsNumberString() periodValue!: string;
  @IsEnum(ProjectPeriodUnit) periodUnit!: ProjectPeriodUnit;
  @IsNumberString() approvedAmount!: string;
  @IsNumberString() executionCost!: string;
  @IsUUID() pmUserId!: string;
  @IsOptional() @IsString() @MaxLength(1000) remark?: string;
}

export class UpdateProjectDto {
  @IsOptional() @IsString() @MaxLength(100) platform?: string;
  @IsOptional() @IsDateString() publishedOn?: string;
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(50) nature?: string;
  @IsOptional() @IsNumberString() periodValue?: string;
  @IsOptional() @IsEnum(ProjectPeriodUnit) periodUnit?: ProjectPeriodUnit;
  @IsOptional() @IsNumberString() approvedAmount?: string;
  @IsOptional() @IsNumberString() executionCost?: string;
  @IsOptional() @IsUUID() pmUserId?: string;
  @IsOptional() @IsEnum(ProjectStatus) status?: ProjectStatus;
  @IsOptional() @IsString() @MaxLength(1000) remark?: string;
}
