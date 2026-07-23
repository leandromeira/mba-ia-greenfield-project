import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { VideoProcessor } from './video-processor';
import { Video } from '../videos/entities/video.entity';
import { StorageService } from '../storage/storage.service';
import storageConfig from '../config/storage.config';

describe('VideoProcessor (Integration)', () => {
  let processor: VideoProcessor;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [storageConfig],
        }),
      ],
      providers: [
        VideoProcessor,
        {
          provide: getRepositoryToken(Video),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        StorageService,
      ],
    }).compile();

    processor = module.get<VideoProcessor>(VideoProcessor);
  });

  it('should instantiate VideoProcessor cleanly', () => {
    expect(processor).toBeDefined();
  });
});
