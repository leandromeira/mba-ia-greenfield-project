import { ConfigModule, type ConfigType } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import storageConfig from './storage.config';

const loadConfig = async (envVars?: {
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_ACCESS_KEY?: string;
  S3_SECRET_KEY?: string;
  S3_BUCKET_VIDEOS?: string;
  S3_BUCKET_THUMBNAILS?: string;
}): Promise<ConfigType<typeof storageConfig>> => {
  const envKeys = [
    'S3_ENDPOINT',
    'S3_REGION',
    'S3_ACCESS_KEY',
    'S3_SECRET_KEY',
    'S3_BUCKET_VIDEOS',
    'S3_BUCKET_THUMBNAILS',
  ];

  envKeys.forEach((key) => {
    delete process.env[key];
  });

  if (envVars) {
    Object.entries(envVars).forEach(([key, val]) => {
      process.env[key] = val;
    });
  }

  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ ignoreEnvFile: true, load: [storageConfig] }),
    ],
  }).compile();

  const config = module.get<ConfigType<typeof storageConfig>>(
    storageConfig.KEY,
  );
  await module.close();
  return config;
};

describe('storageConfig', () => {
  afterEach(() => {
    [
      'S3_ENDPOINT',
      'S3_REGION',
      'S3_ACCESS_KEY',
      'S3_SECRET_KEY',
      'S3_BUCKET_VIDEOS',
      'S3_BUCKET_THUMBNAILS',
    ].forEach((key) => delete process.env[key]);
  });

  it('should return default storage config values when env vars are missing', async () => {
    const config = await loadConfig();
    expect(config.endpoint).toBe('http://minio:9000');
    expect(config.region).toBe('us-east-1');
    expect(config.accessKey).toBe('minioadmin');
    expect(config.secretKey).toBe('minioadmin');
    expect(config.bucketVideos).toBe('streamtube-videos');
    expect(config.bucketThumbnails).toBe('streamtube-thumbnails');
  });

  it('should return custom storage config values when env vars are set', async () => {
    const config = await loadConfig({
      S3_ENDPOINT: 'http://custom-s3:9000',
      S3_REGION: 'sa-east-1',
      S3_ACCESS_KEY: 'myaccess',
      S3_SECRET_KEY: 'mysecret',
      S3_BUCKET_VIDEOS: 'my-videos',
      S3_BUCKET_THUMBNAILS: 'my-thumbnails',
    });

    expect(config.endpoint).toBe('http://custom-s3:9000');
    expect(config.region).toBe('sa-east-1');
    expect(config.accessKey).toBe('myaccess');
    expect(config.secretKey).toBe('mysecret');
    expect(config.bucketVideos).toBe('my-videos');
    expect(config.bucketThumbnails).toBe('my-thumbnails');
  });
});
