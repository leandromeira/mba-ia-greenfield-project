import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Channel } from '../channels/entities/channel.entity';
import storageConfig from '../config/storage.config';
import { StorageService } from '../storage/storage.service';
import { generateSlug } from '../common/utils/slug.util';
import { CreateVideoUploadDto } from './dto/create-video-upload.dto';
import { VideoUploadResponseDto } from './dto/video-upload-response.dto';
import { Video } from './entities/video.entity';
import { VideoStatus } from './enums/video-status.enum';
import { ChannelNotFoundException } from './exceptions/channel-not-found.exception';
import { VideoForbiddenException } from './exceptions/video-forbidden.exception';
import { VideoNotFoundException } from './exceptions/video-not-found.exception';
import { VideoNotDraftException } from './exceptions/video-not-draft.exception';

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    private readonly storageService: StorageService,
    @InjectQueue('video-processing')
    private readonly videoQueue: Queue,
    @Inject(storageConfig.KEY)
    private readonly s3Config: ConfigType<typeof storageConfig>,
  ) {}

  async createUploadUrl(
    userId: string,
    dto: CreateVideoUploadDto,
  ): Promise<VideoUploadResponseDto> {
    const channel = await this.channelRepository.findOne({
      where: { user_id: userId },
    });

    if (!channel) {
      throw new ChannelNotFoundException();
    }

    const slug = generateSlug();
    const fileKey = `videos/${slug}/${dto.original_filename}`;
    const uploadUrl = await this.storageService.getPresignedUploadUrl(
      fileKey,
      dto.mime_type,
    );

    const video = this.videoRepository.create({
      title: dto.title,
      description: dto.description || null,
      slug,
      status: VideoStatus.DRAFT,
      original_filename: dto.original_filename,
      file_key: fileKey,
      mime_type: dto.mime_type,
      size_bytes: dto.size_bytes.toString(),
      channel_id: channel.id,
    });

    const savedVideo = await this.videoRepository.save(video);

    return {
      video_id: savedVideo.id,
      slug: savedVideo.slug,
      upload_url: uploadUrl,
      status: savedVideo.status,
    };
  }

  async completeUpload(userId: string, videoId: string): Promise<Video> {
    const video = await this.videoRepository.findOne({
      where: { id: videoId },
      relations: ['channel'],
    });

    if (!video) {
      throw new VideoNotFoundException('Video not found');
    }

    if (video.channel.user_id !== userId) {
      throw new VideoForbiddenException();
    }

    if (video.status !== VideoStatus.DRAFT) {
      throw new VideoNotDraftException();
    }

    video.status = VideoStatus.PROCESSING;
    const updatedVideo = await this.videoRepository.save(video);
    await this.enqueueVideoProcessing(updatedVideo.id, updatedVideo.file_key);
    return updatedVideo;
  }

  async findReadyVideoBySlug(slug: string): Promise<Video> {
    const video = await this.videoRepository.findOne({ where: { slug } });
    if (!video || video.status !== VideoStatus.READY) {
      throw new VideoNotFoundException('Video not found or not ready');
    }
    return video;
  }

  async getVideoStream(
    slug: string,
    range?: string,
  ): Promise<{
    stream: import('stream').Readable;
    contentLength?: number;
    contentRange?: string;
    contentType?: string;
  }> {
    const video = await this.findReadyVideoBySlug(slug);
    return this.storageService.getObjectStream(
      this.s3Config.bucketVideos,
      video.file_key,
      range,
    );
  }

  async getDownloadUrl(slug: string): Promise<string> {
    const video = await this.findReadyVideoBySlug(slug);
    return this.storageService.getPresignedDownloadUrl(
      video.file_key,
      video.original_filename,
    );
  }

  async enqueueVideoProcessing(
    videoId: string,
    fileKey: string,
  ): Promise<void> {
    await this.videoQueue.add(
      'process-video',
      { videoId, fileKey },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    );
  }
}
