import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';
import storageConfig from '../config/storage.config';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('http://minio:9000/presigned-url'),
}));

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [storageConfig],
        }),
      ],
      providers: [StorageService],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPresignedUploadUrl', () => {
    it('should return a presigned upload URL', async () => {
      const url = await service.getPresignedUploadUrl(
        'videos/test.mp4',
        'video/mp4',
      );
      expect(url).toBe('http://minio:9000/presigned-url');
    });
  });

  describe('getPresignedDownloadUrl', () => {
    it('should return a presigned download URL', async () => {
      const url = await service.getPresignedDownloadUrl(
        'videos/test.mp4',
        'test.mp4',
      );
      expect(url).toBe('http://minio:9000/presigned-url');
    });
  });
});
