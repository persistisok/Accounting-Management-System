import { InvoiceDirection, ProjectStatus, RecordStatus, ReviewStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export enum ExportDataset {
  PROJECTS = 'projects',
  CONTRACTS = 'contracts',
  BANKING = 'banking',
  INVOICES = 'invoices',
  SUPPORTERS = 'supporters',
  EXECUTORS = 'executors',
  EXPERTS = 'experts',
  MEMBERS = 'members',
}

export class ExportQueryDto {
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsString() @MaxLength(100) platform?: string;
  @IsOptional() @IsString() @MaxLength(50) nature?: string;
  @IsOptional() @IsString() @MaxLength(50) projectType?: string;
  @IsOptional() @IsDateString() publishedFrom?: string;
  @IsOptional() @IsDateString() publishedTo?: string;
  @IsOptional() @IsEnum(ProjectStatus) projectStatus?: ProjectStatus;
  @IsOptional() @IsEnum(InvoiceDirection) direction?: InvoiceDirection;
  @IsOptional() @IsEnum(ReviewStatus) reviewStatus?: ReviewStatus;
  @IsOptional() @IsEnum(RecordStatus) recordStatus?: RecordStatus;
  @IsOptional() @IsUUID() committeeId?: string;
}
