import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateVideoUploadDto {
  /** Video title */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  /** Optional video description */
  @IsString()
  @IsOptional()
  description?: string;

  /** Original file name (e.g. my-video.mp4) */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  original_filename: string;

  /** Video MIME type (e.g. video/mp4) */
  @IsString()
  @IsNotEmpty()
  @Matches(/^video\//, {
    message: 'mime_type must be a valid video MIME type (e.g. video/mp4)',
  })
  mime_type: string;

  /** File size in bytes (max 10GB = 10,737,418,240 bytes) */
  @IsNumber()
  @IsPositive()
  @Max(10737418240, {
    message: 'size_bytes cannot exceed 10GB (10737418240 bytes)',
  })
  size_bytes: number;
}
