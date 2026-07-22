import { RecordStatus, ReviewStatus } from '@prisma/client';
import { IsDateString, IsEmail, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ListQueryDto } from '../common/query.dto';

export class ExpertListQueryDto extends ListQueryDto {
  @IsOptional() @IsEnum(ReviewStatus) reviewStatus?: ReviewStatus;
  @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus;
}

export class UpdateExpertDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(32) idNumber?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(200) organizationName?: string;
  @IsOptional() @IsString() @MaxLength(100) department?: string;
  @IsOptional() @IsString() @MaxLength(100) position?: string;
  @IsOptional() @IsString() @MaxLength(100) professionalTitle?: string;
  @IsOptional() @IsString() @MaxLength(200) bankName?: string;
  @IsOptional() @IsString() @MaxLength(64) bankAccount?: string;
  @IsOptional() @IsDateString() joinedOn?: string;
  @IsOptional() @IsUUID() formOwnerId?: string;
}

export class CreateExpertDto {
  @IsString() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(32) idNumber?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(200) organizationName?: string;
  @IsOptional() @IsString() @MaxLength(100) department?: string;
  @IsOptional() @IsString() @MaxLength(100) position?: string;
  @IsOptional() @IsString() @MaxLength(100) professionalTitle?: string;
  @IsOptional() @IsString() @MaxLength(200) bankName?: string;
  @IsOptional() @IsString() @MaxLength(64) bankAccount?: string;
  @IsOptional() @IsDateString() joinedOn?: string;
  @IsUUID() formOwnerId!: string;
}

export class ReviewExpertDto {
  @IsIn(['APPROVED', 'REJECTED']) reviewStatus!: ReviewStatus;
}
