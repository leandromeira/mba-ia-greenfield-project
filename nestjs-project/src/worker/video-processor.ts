import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Repository } from 'typeorm';
import storageConfig from '../config/storage.config';
import { StorageService } from '../storage/storage.service';
import { Video } from '../videos/entities/video.entity';
import { VideoStatus } from '../videos/enums/video-status.enum';

export interface VideoProcessingJobData {
  videoId: string;
  fileKey: string;
}

@Injectable()
@Processor('video-processing')
export class VideoProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoProcessor.name);

  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    private readonly storageService: StorageService,
    @Inject(storageConfig.KEY)
    private readonly s3Config: ConfigType<typeof storageConfig>,
  ) {
    super();
  }

  async process(job: Job<VideoProcessingJobData>): Promise<void> {
    const { videoId, fileKey } = job.data;
    this.logger.log(`Processing video job ${job.id} for videoId=${videoId}`);

    const video = await this.videoRepository.findOne({
      where: { id: videoId },
    });

    if (!video) {
      this.logger.error(`Video ${videoId} not found in database`);
      throw new Error(`Video ${videoId} not found`);
    }

    const tmpDir = os.tmpdir();
    const videoTmpPath = path.join(tmpDir, `video-${video.slug}.mp4`);
    const thumbTmpPath = path.join(tmpDir, `thumb-${video.slug}.jpg`);

    try {
      const { stream } = await this.storageService.getObjectStream(
        this.s3Config.bucketVideos,
        fileKey,
      );

      await this.saveStreamToFile(stream, videoTmpPath);

      const metadata = await this.extractMetadata(videoTmpPath);

      await this.generateThumbnail(videoTmpPath, thumbTmpPath);

      const thumbnailKey = `thumbnails/${video.slug}.jpg`;
      const thumbBuffer = await fs.promises.readFile(thumbTmpPath);
      await this.uploadThumbnailFile(thumbnailKey, thumbBuffer);

      video.status = VideoStatus.READY;
      video.duration_seconds = metadata.duration;
      video.width = metadata.width;
      video.height = metadata.height;
      video.thumbnail_key = thumbnailKey;
      video.processing_error = null;

      await this.videoRepository.save(video);
      this.logger.log(`Successfully processed video ${videoId}`);
    } catch (error: unknown) {
      const errorMessage =
        (error as Error).message || 'Unknown processing error';
      this.logger.error(
        `Failed to process video ${videoId}: ${errorMessage}`,
        (error as Error).stack,
      );

      video.status = VideoStatus.FAILED;
      video.processing_error = errorMessage;
      await this.videoRepository.save(video);

      throw error;
    } finally {
      await this.safeUnlink(videoTmpPath);
      await this.safeUnlink(thumbTmpPath);
    }
  }

  private saveStreamToFile(
    stream: NodeJS.ReadableStream,
    targetPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(targetPath);
      stream.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      stream.on('error', reject);
    });
  }

  private extractMetadata(
    filePath: string,
  ): Promise<{ duration: number; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          return reject(err instanceof Error ? err : new Error(String(err)));
        }
        const videoStream = metadata.streams?.find(
          (s) => s.codec_type === 'video',
        );
        resolve({
          duration: metadata.format?.duration || 0,
          width: videoStream?.width || 0,
          height: videoStream?.height || 0,
        });
      });
    });
  }

  private generateThumbnail(
    videoPath: string,
    thumbPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(0)
        .frames(1)
        .size('1280x720')
        .output(thumbPath)
        .on('end', () => resolve())
        .on('error', (err) =>
          reject(err instanceof Error ? err : new Error(String(err))),
        )
        .run();
    });
  }

  private async uploadThumbnailFile(
    key: string,
    buffer: Buffer,
  ): Promise<void> {
    await this.storageService.uploadObject(
      this.s3Config.bucketThumbnails,
      key,
      buffer,
      'image/jpeg',
    );
  }

  private async safeUnlink(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch {
      // ignore cleanup errors
    }
  }
}
