import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';
import storageConfig from '../config/storage.config';

describe('StorageService (Integration)', () => {
  let service: StorageService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [storageConfig],
        }),
      ],
      providers: [StorageService],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  it('should instantiate StorageService cleanly', () => {
    expect(service).toBeDefined();
  });

  it('should generate valid upload and download presigned URLs', async () => {
    const uploadUrl = await service.getPresignedUploadUrl(
      'test-key.mp4',
      'video/mp4',
    );
    expect(uploadUrl).toContain('test-key.mp4');

    const downloadUrl = await service.getPresignedDownloadUrl(
      'test-key.mp4',
      'my-video.mp4',
    );
    expect(downloadUrl).toContain('test-key.mp4');
  });
});
