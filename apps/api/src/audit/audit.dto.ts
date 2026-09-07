import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ListQueryDto } from '../common/query.dto';

export class AuditLogListQueryDto extends ListQueryDto {
  @IsOptional() @IsUUID() actorUserId?: string;
  @IsOptional() @IsString() @MaxLength(30) action?: string;
  @IsOptional() @IsString() @MaxLength(50) objectType?: string;
  @IsOptional() @IsDateString() occurredFrom?: string;
  @IsOptional() @IsDateString() occurredTo?: string;
}
