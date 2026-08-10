import { ProjectStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsNumberString, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { ListQueryDto } from '../common/query.dto';

export enum ProjectPeriodUnit {
  MONTH = 'MONTH',
  YEAR = 'YEAR',
}

export class ProjectListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional() @IsString() @MaxLength(100)
  platform?: string;

  @IsOptional() @IsString() @MaxLength(50)
  nature?: string;

  @IsOptional() @IsString() @MaxLength(50)
  projectType?: string;

  @IsOptional() @IsDateString()
  publishedFrom?: string;

  @IsOptional() @IsDateString()
  publishedTo?: string;
}

export class CreateProjectDto {
  @IsString() @MaxLength(100) platform!: string;
  @IsString() @Matches(/^[A-Za-z]{1,10}$/, { message: '平台缩写只能填写 1 至 10 位英文字母' })
  platformAbbreviation!: string;
  @IsDateString() publishedOn!: string;
  @IsString() @MaxLength(200) name!: string;
  @IsString() @MaxLength(50) nature!: string;
  @IsString() @MaxLength(50) projectType!: string;
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
  @IsOptional() @IsString() @MaxLength(50) projectType?: string;
  @IsOptional() @IsNumberString() periodValue?: string;
  @IsOptional() @IsEnum(ProjectPeriodUnit) periodUnit?: ProjectPeriodUnit;
  @IsOptional() @IsNumberString() approvedAmount?: string;
  @IsOptional() @IsNumberString() executionCost?: string;
  @IsOptional() @IsUUID() pmUserId?: string;
  @IsOptional() @IsString() @MaxLength(1000) remark?: string;
}

export class RequestProjectStatusDto {
  @IsIn([ProjectStatus.CLOSED, ProjectStatus.ABORTED])
  status!: ProjectStatus;
}

export enum ProjectReviewDecision {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class ReviewProjectChangeDto {
  @IsEnum(ProjectReviewDecision)
  decision!: ProjectReviewDecision;
}
