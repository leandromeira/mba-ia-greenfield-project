import storageConfig from './storage.config';

describe('storageConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return default storage config values when env vars are missing', () => {
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_REGION;
    delete process.env.S3_ACCESS_KEY;
    delete process.env.S3_SECRET_KEY;
    delete process.env.S3_BUCKET_VIDEOS;
    delete process.env.S3_BUCKET_THUMBNAILS;

    const config = storageConfig();
    expect(config.endpoint).toBe('http://minio:9000');
    expect(config.region).toBe('us-east-1');
    expect(config.accessKey).toBe('minioadmin');
    expect(config.secretKey).toBe('minioadmin');
    expect(config.bucketVideos).toBe('streamtube-videos');
    expect(config.bucketThumbnails).toBe('streamtube-thumbnails');
  });

  it('should return custom storage config values when env vars are set', () => {
    process.env.S3_ENDPOINT = 'http://custom-s3:9000';
    process.env.S3_REGION = 'sa-east-1';
    process.env.S3_ACCESS_KEY = 'myaccess';
    process.env.S3_SECRET_KEY = 'mysecret';
    process.env.S3_BUCKET_VIDEOS = 'my-videos';
    process.env.S3_BUCKET_THUMBNAILS = 'my-thumbnails';

    const config = storageConfig();
    expect(config.endpoint).toBe('http://custom-s3:9000');
    expect(config.region).toBe('sa-east-1');
    expect(config.accessKey).toBe('myaccess');
    expect(config.secretKey).toBe('mysecret');
    expect(config.bucketVideos).toBe('my-videos');
    expect(config.bucketThumbnails).toBe('my-thumbnails');
  });
});
