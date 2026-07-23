import { ApiProperty } from '@nestjs/swagger';
import { VideoStatus } from '../enums/video-status.enum';

export class VideoUploadResponseDto {
  @ApiProperty({ description: 'ID of the created video record' })
  video_id: string;

  @ApiProperty({ description: 'Unique 12-char URL-safe slug' })
  slug: string;

  @ApiProperty({ description: 'S3 Presigned PUT URL for direct file upload' })
  upload_url: string;

  @ApiProperty({
    enum: VideoStatus,
    description: 'Initial video status (DRAFT)',
  })
  status: VideoStatus;
}
