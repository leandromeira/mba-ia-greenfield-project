import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('VideosController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /videos/upload-url', () => {
    it('should return 401 Unauthorized when unauthenticated', async () => {
      await request(app.getHttpServer())
        .post('/videos/upload-url')
        .send({
          title: 'My Video',
          original_filename: 'video.mp4',
          mime_type: 'video/mp4',
          size_bytes: 100000,
        })
        .expect(401);
    });
  });

  describe('POST /videos/:id/complete-upload', () => {
    it('should return 401 Unauthorized when unauthenticated', async () => {
      await request(app.getHttpServer())
        .post('/videos/some-id/complete-upload')
        .expect(401);
    });
  });
});
