import { IsDateString, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ListQueryDto } from '../common/query.dto';

export class MembershipListQueryDto extends ListQueryDto {
  @IsOptional() @IsUUID() committeeId?: string;
}

export class CreateCommitteeDto {
  @IsString() @MaxLength(32) committeeCode!: string;
  @IsString() @MaxLength(200) name!: string;
  @IsDateString() establishedOn!: string;
  @IsUUID() ownerUserId!: string;
}

export class CreateMembershipDto {
  @IsString() @MaxLength(200) memberName!: string;
  @IsUUID() committeeId!: string;
  @IsString() @MaxLength(50) memberType!: string;
  @IsUUID() pmUserId!: string;
  @IsOptional() @IsDateString() joinedOn?: string;
}

export class CreateMemberDueDto {
  @IsUUID() membershipId!: string;
  @IsString() @MaxLength(32) dueCode!: string;
  @IsOptional() @IsString() @MaxLength(50) periodLabel?: string;
  @IsNumberString() amountDue!: string;
  @IsOptional() @IsDateString() dueOn?: string;
}
