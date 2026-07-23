import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { CreateVideoUploadDto } from './dto/create-video-upload.dto';
import { VideoUploadResponseDto } from './dto/video-upload-response.dto';
import { VideosService } from './videos.service';

@ApiTags('videos')
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post('upload-url')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Request presigned upload URL',
    description:
      'Creates a new video record in DRAFT status and returns a presigned S3 PUT URL for direct-to-storage upload.',
  })
  @ApiResponse({
    status: 201,
    description: 'Presigned upload URL created successfully',
    type: VideoUploadResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or invalid input data',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have a channel',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async createUploadUrl(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateVideoUploadDto,
  ): Promise<VideoUploadResponseDto> {
    return this.videosService.createUploadUrl(user.sub, dto);
  }

  @Post(':id/complete-upload')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Signal upload completion',
    description:
      'Signals that file upload to S3 is complete, transitioning video status from DRAFT to PROCESSING.',
  })
  @ApiResponse({
    status: 200,
    description: 'Video status transitioned to PROCESSING',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - user does not own this video',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async completeUpload(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.videosService.completeUpload(user.sub, id);
  }

  @Public()
  @Get(':slug/stream')
  @HttpCode(HttpStatus.PARTIAL_CONTENT)
  @ApiOperation({
    summary: 'Stream video (HTTP 206 Partial Content)',
    description:
      'Public endpoint to stream video content with Range header support for video seeking.',
  })
  @ApiResponse({
    status: 206,
    description: 'Partial content video stream',
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found or not ready',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async streamVideo(
    @Param('slug') slug: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, contentLength, contentRange, contentType } =
      await this.videosService.getVideoStream(slug, range);

    res.setHeader('Accept-Ranges', 'bytes');
    if (contentType) res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);

    if (range && contentRange) {
      res.status(HttpStatus.PARTIAL_CONTENT);
      res.setHeader('Content-Range', contentRange);
    } else {
      res.status(HttpStatus.OK);
    }

    stream.pipe(res);
  }

  @Public()
  @Get(':slug/download')
  @ApiOperation({
    summary: 'Get video download URL',
    description:
      'Public endpoint to obtain a direct presigned GET download URL with attachment disposition.',
  })
  @ApiResponse({
    status: 200,
    description: 'Redirects to presigned download URL',
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found or not ready',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async getDownloadUrl(
    @Param('slug') slug: string,
    @Res() res: Response,
  ): Promise<void> {
    const downloadUrl = await this.videosService.getDownloadUrl(slug);
    res.redirect(downloadUrl);
  }
}
