import redisConfig from './redis.config';

describe('redisConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return default redis config values when env vars are missing', () => {
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;

    const config = redisConfig();
    expect(config.host).toBe('redis');
    expect(config.port).toBe(6379);
  });

  it('should return configured redis values when env vars are set', () => {
    process.env.REDIS_HOST = 'custom-redis';
    process.env.REDIS_PORT = '6380';

    const config = redisConfig();
    expect(config.host).toBe('custom-redis');
    expect(config.port).toBe(6380);
  });
});
