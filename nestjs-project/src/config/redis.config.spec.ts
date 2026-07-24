import { ConfigModule, type ConfigType } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import redisConfig from './redis.config';

const loadConfig = async (
  redisHost?: string,
  redisPort?: string,
): Promise<ConfigType<typeof redisConfig>> => {
  if (redisHost !== undefined) {
    process.env.REDIS_HOST = redisHost;
  } else {
    delete process.env.REDIS_HOST;
  }

  if (redisPort !== undefined) {
    process.env.REDIS_PORT = redisPort;
  } else {
    delete process.env.REDIS_PORT;
  }

  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ ignoreEnvFile: true, load: [redisConfig] }),
    ],
  }).compile();

  const config = module.get<ConfigType<typeof redisConfig>>(redisConfig.KEY);
  await module.close();
  return config;
};

describe('redisConfig', () => {
  afterEach(() => {
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
  });

  it('should return default redis config values when env vars are missing', async () => {
    const config = await loadConfig();
    expect(config.host).toBe('redis');
    expect(config.port).toBe(6379);
  });

  it('should return configured redis values when env vars are set', async () => {
    const config = await loadConfig('custom-redis', '6380');
    expect(config.host).toBe('custom-redis');
    expect(config.port).toBe(6380);
  });
});
