import { AllocationCategory, InvoiceCategory, InvoiceCollectionStatus, InvoiceStatus, ProjectStatus, RecordStatus, ReviewStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export enum ExportDataset {
  PROJECTS = 'projects',
  CONTRACTS = 'contracts',
  BANKING = 'banking',
  INVOICES = 'invoices',
  SUPPORTERS = 'supporters',
  EXECUTORS = 'executors',
  EXPERTS = 'experts',
  MEMBERS = 'members',
  DONATION_RECEIPTS = 'donation-receipts',
}

export class ExportQueryDto {
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsString() @MaxLength(100) platform?: string;
  @IsOptional() @IsString() @MaxLength(50) nature?: string;
  @IsOptional() @IsString() @MaxLength(50) projectType?: string;
  @IsOptional() @IsUUID() pmUserId?: string;
  @IsOptional() @IsDateString() publishedFrom?: string;
  @IsOptional() @IsDateString() publishedTo?: string;
  @IsOptional() @IsEnum(ProjectStatus) projectStatus?: ProjectStatus;
  @IsOptional() @IsEnum(InvoiceCategory) invoiceCategory?: InvoiceCategory;
  @IsOptional() @IsEnum(InvoiceStatus) invoiceStatus?: InvoiceStatus;
  @IsOptional() @IsEnum(InvoiceCollectionStatus) invoiceCollectionStatus?: InvoiceCollectionStatus;
  @IsOptional() @IsDateString() issuedFrom?: string;
  @IsOptional() @IsDateString() issuedTo?: string;
  @IsOptional() @IsUUID() invoiceProjectId?: string;
  @IsOptional() @IsUUID() invoiceMembershipId?: string;
  @IsOptional() @IsUUID() invoiceCommitteeId?: string;
  @IsOptional() @IsEnum(ReviewStatus) reviewStatus?: ReviewStatus;
  @IsOptional() @IsEnum(RecordStatus) recordStatus?: RecordStatus;
  @IsOptional() @IsUUID() committeeId?: string;
  @IsOptional() @IsDateString() paymentFrom?: string;
  @IsOptional() @IsDateString() paymentTo?: string;
  @IsOptional() @IsEnum(AllocationCategory) bankCategory?: AllocationCategory;
  @IsOptional() @IsUUID() bankProjectId?: string;
  @IsOptional() @IsUUID() bankExpertProfileId?: string;
  @IsOptional() @IsUUID() bankMembershipId?: string;
  @IsOptional() @IsDateString() transactionFrom?: string;
  @IsOptional() @IsDateString() transactionTo?: string;
  @IsOptional() @IsUUID() donationProjectId?: string;
  @IsOptional() @IsUUID() donationDonorId?: string;
  @IsOptional() @IsIn(['NORMAL', 'VOID']) donationStatus?: 'NORMAL' | 'VOID';
  @IsOptional() @IsDateString() donationIssuedFrom?: string;
  @IsOptional() @IsDateString() donationIssuedTo?: string;
  @IsOptional() @IsIn(['ACTIVE', 'VOID']) transactionStatus?: 'ACTIVE' | 'VOID';
}
