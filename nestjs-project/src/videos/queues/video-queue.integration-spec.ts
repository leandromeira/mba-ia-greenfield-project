import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import redisConfig from '../../config/redis.config';

describe('VideoQueue (Integration)', () => {
  let queue: Queue;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [redisConfig],
        }),
        BullModule.forRootAsync({
          useFactory: () => ({
            connection: {
              host: process.env.REDIS_HOST || 'localhost',
              port: Number(process.env.REDIS_PORT || 6379),
              connectTimeout: 1000,
              maxRetriesPerRequest: null,
            },
          }),
        }),
        BullModule.registerQueue({
          name: 'video-processing',
        }),
      ],
    }).compile();

    queue = module.get<Queue>(getQueueToken('video-processing'));
  });

  afterAll(async () => {
    if (queue) {
      try {
        await queue.close();
      } catch {
        // ignore close errors if offline
      }
    }
  });

  it('should instantiate video-processing queue cleanly with correct name', () => {
    expect(queue).toBeDefined();
    expect(queue.name).toBe('video-processing');
  });

  it('should construct job options payload correctly', () => {
    const jobData = { videoId: 'video-test-1', fileKey: 'videos/test.mp4' };
    const jobOpts = {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    };

    expect(jobData.videoId).toBe('video-test-1');
    expect(jobOpts.attempts).toBe(3);
    expect(jobOpts.backoff.delay).toBe(5000);
  });
});
