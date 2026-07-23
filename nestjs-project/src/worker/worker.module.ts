import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import appConfig from '../config/app.config';
import databaseConfig from '../config/database.config';
import redisConfig from '../config/redis.config';
import storageConfig from '../config/storage.config';
import { envValidationSchema } from '../config/env.validation';
import { StorageModule } from '../storage/storage.module';
import { Video } from '../videos/entities/video.entity';
import { VideoProcessor } from './video-processor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, storageConfig],
      validationSchema: envValidationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [databaseConfig.KEY],
      useFactory: (dbConfig: ConfigType<typeof databaseConfig>) => ({
        type: 'postgres',
        host: dbConfig.host,
        port: dbConfig.port,
        username: dbConfig.username,
        password: dbConfig.password,
        database: dbConfig.name,
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    TypeOrmModule.forFeature([Video]),
    StorageModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [redisConfig.KEY],
      useFactory: (config: ConfigType<typeof redisConfig>) => ({
        connection: {
          host: config.host,
          port: config.port,
        },
      }),
    }),
    BullModule.registerQueue({
      name: 'video-processing',
    }),
  ],
  providers: [VideoProcessor],
})
export class WorkerModule {}
