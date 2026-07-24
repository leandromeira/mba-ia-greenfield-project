import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import {
  cleanAllTables,
  createTestDataSource,
} from '../src/test/create-test-data-source';
import { User } from '../src/users/entities/user.entity';
import { Channel } from '../src/channels/entities/channel.entity';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity';
import { VerificationToken } from '../src/auth/entities/verification-token.entity';
import { Video } from '../src/videos/entities/video.entity';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';

describe('VideosController (e2e)', () => {
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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
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

  async function registerConfirmAndLogin(
    email: string,
    password = 'password123',
  ): Promise<{ access_token: string }> {
    const authService = app.get(AuthService);
    const mailServiceInstance = (
      authService as unknown as {
        mailService: {
          sendConfirmationEmail: (
            e: string,
            n: string,
            t: string,
          ) => Promise<void>;
        };
      }
    ).mailService;
    let capturedToken = '';
    jest
      .spyOn(mailServiceInstance, 'sendConfirmationEmail')
      .mockImplementationOnce(async (_e: string, _n: string, t: string) => {
        capturedToken = t;
      });

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password });

    await request(app.getHttpServer())
      .get('/auth/confirm-email')
      .query({ token: capturedToken });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });

    return { access_token: loginRes.body.access_token as string };
  }

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

    it('should return 201 with upload URL and video draft when authenticated', async () => {
      const { access_token } = await registerConfirmAndLogin(
        'uploader@example.com',
      );

      const res = await request(app.getHttpServer())
        .post('/videos/upload-url')
        .set('Authorization', `Bearer ${access_token}`)
        .send({
          title: 'My Cool Video',
          description: 'A test description',
          original_filename: 'sample.mp4',
          mime_type: 'video/mp4',
          size_bytes: 1048576,
        })
        .expect(201);

      expect(res.body).toHaveProperty('video_id');
      expect(res.body).toHaveProperty('slug');
      expect(res.body).toHaveProperty('upload_url');
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.slug).toHaveLength(12);
    });
  });

  describe('POST /videos/:id/complete-upload', () => {
    it('should return 401 Unauthorized when unauthenticated', async () => {
      await request(app.getHttpServer())
        .post('/videos/some-id/complete-upload')
        .expect(401);
    });

    it('should transition video status to PROCESSING when authenticated user completes upload', async () => {
      const { access_token } = await registerConfirmAndLogin(
        'creator@example.com',
      );

      const uploadRes = await request(app.getHttpServer())
        .post('/videos/upload-url')
        .set('Authorization', `Bearer ${access_token}`)
        .send({
          title: 'Video To Complete',
          original_filename: 'test.mp4',
          mime_type: 'video/mp4',
          size_bytes: 500000,
        })
        .expect(201);

      const videoId = uploadRes.body.video_id as string;

      const completeRes = await request(app.getHttpServer())
        .post(`/videos/${videoId}/complete-upload`)
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);

      expect(completeRes.body.id).toBe(videoId);
      expect(completeRes.body.status).toBe('PROCESSING');
    });
  });
});
