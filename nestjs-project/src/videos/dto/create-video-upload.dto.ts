import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
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
  mime_type: string;

  /** File size in bytes */
  @IsNumber()
  @IsPositive()
  size_bytes: number;
}
