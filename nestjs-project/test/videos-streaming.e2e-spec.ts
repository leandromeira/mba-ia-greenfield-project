import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { StorageService } from '../src/storage/storage.service';
import { Video } from '../src/videos/entities/video.entity';
import { VideoStatus } from '../src/videos/enums/video-status.enum';
import { Channel } from '../src/channels/entities/channel.entity';
import { User } from '../src/users/entities/user.entity';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity';
import { VerificationToken } from '../src/auth/entities/verification-token.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../src/test/create-test-data-source';

import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';

describe('Videos Streaming (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = createTestDataSource([
      User,
      Channel,
      RefreshToken,
      VerificationToken,
      Video,
    ]);
    await dataSource.initialize();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DataSource)
      .useValue(dataSource)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  describe('GET /videos/:slug/stream', () => {
    it('should return 404 for non-existent video slug', async () => {
      await request(app.getHttpServer())
        .get('/videos/non-existent-slug-123/stream')
        .expect(404);
    });

    it('should return stream when video is READY', async () => {
      const userRepo = dataSource.getRepository(User);
      const channelRepo = dataSource.getRepository(Channel);
      const videoRepo = dataSource.getRepository(Video);

      const user = (await userRepo.save(
        userRepo.create({
          email: 'streamer@example.com',
          password: 'hash',
          is_confirmed: true,
        }),
      )) as unknown as User;

      const channel = (await channelRepo.save(
        channelRepo.create({
          name: 'Stream Channel',
          nickname: 'streamer',
          user_id: user.id,
        }),
      )) as unknown as Channel;

      const slug = 'streamable12';
      const fileKey = `videos/${slug}/sample.mp4`;

      await videoRepo.save(
        videoRepo.create({
          title: 'Ready Video',
          slug,
          status: VideoStatus.READY,
          original_filename: 'sample.mp4',
          file_key: fileKey,
          mime_type: 'video/mp4',
          size_bytes: '1048576',
          channel_id: channel.id,
        }),
      );

      const storageService = app.get(StorageService);
      const storageServiceAny = storageService as unknown as {
        uploadObject: (
          b: string,
          k: string,
          body: Buffer,
          mime: string,
        ) => Promise<void>;
      };

      try {
        await storageServiceAny.uploadObject(
          'streamtube-videos',
          fileKey,
          Buffer.from('test video content payload'),
          'video/mp4',
        );
      } catch {
        // storage unreachable in test env, skip upload
      }

      const res = await request(app.getHttpServer())
        .get(`/videos/${slug}/stream`)
        .set('Range', 'bytes=0-10');

      expect([200, 206]).toContain(res.status);
    });
  });

  describe('GET /videos/:slug/download', () => {
    it('should return 404 for non-existent video slug', async () => {
      await request(app.getHttpServer())
        .get('/videos/non-existent-slug-123/download')
        .expect(404);
    });

    it('should return 302 redirect for READY video download', async () => {
      const userRepo = dataSource.getRepository(User);
      const channelRepo = dataSource.getRepository(Channel);
      const videoRepo = dataSource.getRepository(Video);

      const user = (await userRepo.save(
        userRepo.create({
          email: 'downloader@example.com',
          password: 'hash',
          is_confirmed: true,
        }),
      )) as unknown as User;

      const channel = (await channelRepo.save(
        channelRepo.create({
          name: 'Download Channel',
          nickname: 'downloader',
          user_id: user.id,
        }),
      )) as unknown as Channel;

      const slug = 'downloadable';

      await videoRepo.save(
        videoRepo.create({
          title: 'Download Video',
          slug,
          status: VideoStatus.READY,
          original_filename: 'sample.mp4',
          file_key: `videos/${slug}/sample.mp4`,
          mime_type: 'video/mp4',
          size_bytes: '1048576',
          channel_id: channel.id,
        }),
      );

      await request(app.getHttpServer())
        .get(`/videos/${slug}/download`)
        .expect(302);
    });
  });
});
