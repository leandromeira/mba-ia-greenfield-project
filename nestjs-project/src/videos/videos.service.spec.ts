import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Channel } from '../channels/entities/channel.entity';
import { StorageService } from '../storage/storage.service';
import { Video } from './entities/video.entity';
import { VideoStatus } from './enums/video-status.enum';
import { VideosService } from './videos.service';

describe('VideosService', () => {
  let service: VideosService;
  let videoRepoMock: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  let channelRepoMock: {
    findOne: jest.Mock;
  };
  let storageServiceMock: {
    getPresignedUploadUrl: jest.Mock;
  };

  beforeEach(async () => {
    videoRepoMock = {
      create: jest.fn((dto: unknown) => dto as Video),
      save: jest.fn((entity: unknown) =>
        Promise.resolve({
          id: 'video-uuid-1',
          ...(entity as Record<string, unknown>),
        }),
      ),
      findOne: jest.fn(),
    };

    channelRepoMock = {
      findOne: jest.fn(),
    };

    storageServiceMock = {
      getPresignedUploadUrl: jest
        .fn()
        .mockResolvedValue('http://minio:9000/presigned-put-url'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideosService,
        {
          provide: getRepositoryToken(Video),
          useValue: videoRepoMock,
        },
        {
          provide: getRepositoryToken(Channel),
          useValue: channelRepoMock,
        },
        {
          provide: StorageService,
          useValue: storageServiceMock,
        },
      ],
    }).compile();

    service = module.get<VideosService>(VideosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createUploadUrl', () => {
    it('should throw ForbiddenException if user has no channel', async () => {
      channelRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.createUploadUrl('user-1', {
          title: 'Test Video',
          original_filename: 'test.mp4',
          mime_type: 'video/mp4',
          size_bytes: 1048576,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should create draft video and return presigned upload url when user has a channel', async () => {
      channelRepoMock.findOne.mockResolvedValue({
        id: 'channel-1',
        user_id: 'user-1',
      });

      const res = await service.createUploadUrl('user-1', {
        title: 'Test Video',
        original_filename: 'test.mp4',
        mime_type: 'video/mp4',
        size_bytes: 1048576,
      });

      expect(res.video_id).toBe('video-uuid-1');
      expect(res.status).toBe(VideoStatus.DRAFT);
      expect(res.upload_url).toBe('http://minio:9000/presigned-put-url');
      expect(res.slug).toHaveLength(12);
    });
  });

  describe('completeUpload', () => {
    it('should throw NotFoundException if video is not found', async () => {
      videoRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.completeUpload('user-1', 'invalid-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if video belongs to another channel', async () => {
      videoRepoMock.findOne.mockResolvedValue({
        id: 'video-1',
        status: VideoStatus.DRAFT,
        channel: { user_id: 'other-user' },
      });

      await expect(service.completeUpload('user-1', 'video-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException if video status is not DRAFT', async () => {
      videoRepoMock.findOne.mockResolvedValue({
        id: 'video-1',
        status: VideoStatus.READY,
        channel: { user_id: 'user-1' },
      });

      await expect(service.completeUpload('user-1', 'video-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should transition status to PROCESSING and return saved video', async () => {
      const mockVideo = {
        id: 'video-1',
        status: VideoStatus.DRAFT,
        channel: { user_id: 'user-1' },
      };
      videoRepoMock.findOne.mockResolvedValue(mockVideo);

      const result = await service.completeUpload('user-1', 'video-1');
      expect(result.status).toBe(VideoStatus.PROCESSING);
    });
  });
});
