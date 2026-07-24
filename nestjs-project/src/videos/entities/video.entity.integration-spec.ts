import { DataSource } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Channel } from '../../channels/entities/channel.entity';
import { Video } from './video.entity';
import { VideoStatus } from '../enums/video-status.enum';
import { generateSlug } from '../../common/utils/slug.util';
import {
  cleanAllTables,
  createTestDataSource,
} from '../../test/create-test-data-source';

describe('Video Entity (Integration)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = createTestDataSource([User, Channel, Video]);
    await dataSource.initialize();
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM "videos"');
    await cleanAllTables(dataSource);
  });

  it('should create a video entity with default DRAFT status and channel relation', async () => {
    const userRepo = dataSource.getRepository(User);
    const channelRepo = dataSource.getRepository(Channel);
    const videoRepo = dataSource.getRepository(Video);

    const user = await userRepo.save(
      userRepo.create({
        email: 'creator@example.com',
        password: 'hash123',
        is_confirmed: true,
      }),
    );

    const channel = await channelRepo.save(
      channelRepo.create({
        name: 'Creator Channel',
        nickname: 'creatorchannel',
        user_id: user.id,
      }),
    );

    const slug = generateSlug();
    const video = await videoRepo.save(
      videoRepo.create({
        title: 'My First Video',
        description: 'Testing video creation',
        slug,
        original_filename: 'sample.mp4',
        file_key: `videos/${slug}/raw.mp4`,
        mime_type: 'video/mp4',
        size_bytes: '10485760',
        channel_id: channel.id,
      }),
    );

    expect(video.id).toBeDefined();
    expect(video.status).toBe(VideoStatus.DRAFT);
    expect(video.slug).toHaveLength(12);

    const savedVideo = await videoRepo.findOne({
      where: { id: video.id },
      relations: ['channel'],
    });

    expect(savedVideo).toBeDefined();
    expect(savedVideo?.channel.name).toBe('Creator Channel');
  });

  it('should throw unique constraint error when inserting duplicate slug', async () => {
    const userRepo = dataSource.getRepository(User);
    const channelRepo = dataSource.getRepository(Channel);
    const videoRepo = dataSource.getRepository(Video);

    const user = await userRepo.save(
      userRepo.create({
        email: 'creator2@example.com',
        password: 'hash123',
        is_confirmed: true,
      }),
    );

    const channel = await channelRepo.save(
      channelRepo.create({
        name: 'Creator 2 Channel',
        nickname: 'creator2channel',
        user_id: user.id,
      }),
    );

    const duplicateSlug = 'fixedslug123';

    await videoRepo.save(
      videoRepo.create({
        title: 'Video 1',
        slug: duplicateSlug,
        original_filename: 'v1.mp4',
        file_key: 'videos/v1.mp4',
        mime_type: 'video/mp4',
        size_bytes: '1000',
        channel_id: channel.id,
      }),
    );

    await expect(
      videoRepo.save(
        videoRepo.create({
          title: 'Video 2',
          slug: duplicateSlug,
          original_filename: 'v2.mp4',
          file_key: 'videos/v2.mp4',
          mime_type: 'video/mp4',
          size_bytes: '2000',
          channel_id: channel.id,
        }),
      ),
    ).rejects.toThrow();
  });
});
