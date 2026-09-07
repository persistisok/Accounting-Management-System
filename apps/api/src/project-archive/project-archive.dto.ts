import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { ProjectReviewDecision } from '../projects/projects.dto';

export class MarkArchiveItemNotApplicableDto {
  @IsString() @MinLength(2) @MaxLength(500) reason!: string;
}

export class ReviewArchiveItemDto {
  @IsEnum(ProjectReviewDecision) decision!: ProjectReviewDecision;
  @IsString() @MaxLength(500) reason!: string;
}
