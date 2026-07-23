import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Videos Streaming (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /videos/:slug/stream', () => {
    it('should return 404 for non-existent video slug', async () => {
      await request(app.getHttpServer())
        .get('/videos/non-existent-slug-123/stream')
        .expect(404);
    });
  });

  describe('GET /videos/:slug/download', () => {
    it('should return 404 for non-existent video slug', async () => {
      await request(app.getHttpServer())
        .get('/videos/non-existent-slug-123/download')
        .expect(404);
    });
  });
});
