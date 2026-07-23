import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel } from '../channels/entities/channel.entity';
import { StorageService } from '../storage/storage.service';
import { generateSlug } from '../common/utils/slug.util';
import { CreateVideoUploadDto } from './dto/create-video-upload.dto';
import { VideoUploadResponseDto } from './dto/video-upload-response.dto';
import { Video } from './entities/video.entity';
import { VideoStatus } from './enums/video-status.enum';

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    private readonly storageService: StorageService,
  ) {}

  async createUploadUrl(
    userId: string,
    dto: CreateVideoUploadDto,
  ): Promise<VideoUploadResponseDto> {
    const channel = await this.channelRepository.findOne({
      where: { user_id: userId },
    });

    if (!channel) {
      throw new ForbiddenException('User does not have an active channel');
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
      throw new NotFoundException('Video not found');
    }

    if (video.channel.user_id !== userId) {
      throw new ForbiddenException(
        'You do not have permission to manage this video',
      );
    }

    if (video.status !== VideoStatus.DRAFT) {
      throw new BadRequestException('Video is not in DRAFT status');
    }

    video.status = VideoStatus.PROCESSING;
    return this.videoRepository.save(video);
  }
}
