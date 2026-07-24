import { VideoNotFoundException } from './exceptions/video-not-found.exception';
import { Readable } from 'stream';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { Channel } from '../channels/entities/channel.entity';
import { StorageService } from '../storage/storage.service';
import { Video } from './entities/video.entity';
import { VideoStatus } from './enums/video-status.enum';
import { VideosService } from './videos.service';

describe('VideosService Streaming & Download', () => {
  let service: VideosService;
  let videoRepoMock: { findOne: jest.Mock };
  let storageServiceMock: {
    getObjectStream: jest.Mock;
    getPresignedDownloadUrl: jest.Mock;
  };

  const mockStorageConfig = {
    endpoint: 'http://localhost:9000',
    region: 'us-east-1',
    accessKey: 'minioadmin',
    secretKey: 'minioadmin',
    bucketVideos: 'streamtube-videos',
    bucketThumbnails: 'streamtube-thumbnails',
  };

  beforeEach(() => {
    videoRepoMock = { findOne: jest.fn() };
    storageServiceMock = {
      getObjectStream: jest.fn(),
      getPresignedDownloadUrl: jest.fn(),
    };

    service = new VideosService(
      videoRepoMock as unknown as Repository<Video>,
      {} as unknown as Repository<Channel>,
      storageServiceMock as unknown as StorageService,
      {} as unknown as Queue,
      mockStorageConfig as any,
    );
  });

  describe('findReadyVideoBySlug', () => {
    it('should throw VideoNotFoundException if video does not exist', async () => {
      videoRepoMock.findOne.mockResolvedValue(null);
      await expect(service.findReadyVideoBySlug('nonexistent')).rejects.toThrow(
        VideoNotFoundException,
      );
    });

    it('should throw VideoNotFoundException if video status is DRAFT', async () => {
      videoRepoMock.findOne.mockResolvedValue({
        slug: 'draftslug',
        status: VideoStatus.DRAFT,
      });
      await expect(service.findReadyVideoBySlug('draftslug')).rejects.toThrow(
        VideoNotFoundException,
      );
    });

    it('should return video if status is READY', async () => {
      const video = { slug: 'readyslug', status: VideoStatus.READY };
      videoRepoMock.findOne.mockResolvedValue(video);
      const res = await service.findReadyVideoBySlug('readyslug');
      expect(res).toBe(video);
    });
  });

  describe('getVideoStream', () => {
    it('should call storageService.getObjectStream with video file_key', async () => {
      const video = {
        slug: 'readyslug',
        status: VideoStatus.READY,
        file_key: 'videos/readyslug/video.mp4',
      };
      videoRepoMock.findOne.mockResolvedValue(video);
      const dummyStream = new Readable();
      storageServiceMock.getObjectStream.mockResolvedValue({
        stream: dummyStream,
        contentLength: 100,
      });

      const res = await service.getVideoStream('readyslug', 'bytes=0-99');
      expect(res.stream).toBe(dummyStream);
      expect(storageServiceMock.getObjectStream).toHaveBeenCalledWith(
        'streamtube-videos',
        'videos/readyslug/video.mp4',
        'bytes=0-99',
      );
    });
  });

  describe('getDownloadUrl', () => {
    it('should return presigned download url', async () => {
      const video = {
        slug: 'readyslug',
        status: VideoStatus.READY,
        file_key: 'videos/readyslug/video.mp4',
        original_filename: 'my-vid.mp4',
      };
      videoRepoMock.findOne.mockResolvedValue(video);
      storageServiceMock.getPresignedDownloadUrl.mockResolvedValue(
        'http://minio:9000/download-url',
      );

      const url = await service.getDownloadUrl('readyslug');
      expect(url).toBe('http://minio:9000/download-url');
    });
  });
});
