import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBase64, IsInt, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class InitMultipartAttachmentDto {
  @IsString()
  @MaxLength(255)
  fileName: string;

  @IsInt()
  @Min(1)
  @Max(5 * 1024 * 1024 * 1024)
  sizeBytes: number;

  @IsBase64()
  @MaxLength(24)
  headerBase64: string;
}

export class MultipartPartUrlDto {
  @IsString()
  @MaxLength(4096)
  token: string;

  @IsInt()
  @Min(1)
  @Max(10_000)
  partNumber: number;
}

export class CompletedPartDto {
  @IsInt()
  @Min(1)
  @Max(10_000)
  number: number;

  @IsString()
  @MaxLength(200)
  etag: string;
}

export class CompleteMultipartAttachmentDto {
  @IsString()
  @MaxLength(4096)
  token: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10_000)
  @ValidateNested({ each: true })
  @Type(() => CompletedPartDto)
  parts: CompletedPartDto[];
}

export class AbortMultipartAttachmentDto {
  @IsString()
  @MaxLength(4096)
  token: string;
}
