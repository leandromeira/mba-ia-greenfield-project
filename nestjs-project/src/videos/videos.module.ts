import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Channel } from '../channels/entities/channel.entity';
import redisConfig from '../config/redis.config';
import { StorageModule } from '../storage/storage.module';
import { Video } from './entities/video.entity';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Video, Channel]),
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
  controllers: [VideosController],
  providers: [VideosService],
  exports: [VideosService, TypeOrmModule, BullModule],
})
export class VideosModule {}
