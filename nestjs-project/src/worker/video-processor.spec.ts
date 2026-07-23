import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { StorageService } from '../storage/storage.service';
import { Video } from '../videos/entities/video.entity';
import { VideoStatus } from '../videos/enums/video-status.enum';
import { VideoProcessor, VideoProcessingJobData } from './video-processor';

describe('VideoProcessor', () => {
  let processor: VideoProcessor;
  let videoRepoMock: {
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let storageServiceMock: {
    getObjectStream: jest.Mock;
    getPresignedUploadUrl: jest.Mock;
  };

  beforeEach(async () => {
    videoRepoMock = {
      findOne: jest.fn(),
      save: jest.fn((v) => Promise.resolve(v)),
    };

    storageServiceMock = {
      getObjectStream: jest.fn(),
      getPresignedUploadUrl: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoProcessor,
        {
          provide: getRepositoryToken(Video),
          useValue: videoRepoMock,
        },
        {
          provide: StorageService,
          useValue: storageServiceMock,
        },
      ],
    }).compile();

    processor = module.get<VideoProcessor>(VideoProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should throw error when video is not found', async () => {
    videoRepoMock.findOne.mockResolvedValue(null);

    const mockJob = {
      id: 'job-1',
      data: { videoId: 'non-existent', fileKey: 'test.mp4' },
    } as Job<VideoProcessingJobData>;

    await expect(processor.process(mockJob)).rejects.toThrow(
      'Video non-existent not found',
    );
  });

  it('should mark video as FAILED if error occurs during process', async () => {
    const mockVideo = {
      id: 'v-123',
      slug: 'slug123',
      status: VideoStatus.PROCESSING,
    };
    videoRepoMock.findOne.mockResolvedValue(mockVideo);
    storageServiceMock.getObjectStream.mockRejectedValue(
      new Error('S3 Connection Error'),
    );

    const mockJob = {
      id: 'job-1',
      data: { videoId: 'v-123', fileKey: 'videos/slug123/raw.mp4' },
    } as Job<VideoProcessingJobData>;

    await expect(processor.process(mockJob)).rejects.toThrow(
      'S3 Connection Error',
    );
    expect(videoRepoMock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: VideoStatus.FAILED,
        processing_error: 'S3 Connection Error',
      }),
    );
  });
});
