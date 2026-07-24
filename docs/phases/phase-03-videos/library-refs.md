---
libs:
  "@aws-sdk/client-s3":
    version: "^3.x"
    context7_id: "/aws/aws-sdk-js-v3"
    fetched_at: "2026-07-23T11:00:50-03:00"
  "@aws-sdk/s3-request-presigner":
    version: "^3.x"
    context7_id: "/aws/aws-sdk-js-v3"
    fetched_at: "2026-07-23T11:00:50-03:00"
  "@nestjs/bullmq":
    version: "^11.x"
    context7_id: "/nestjs/bull"
    fetched_at: "2026-07-23T11:00:50-03:00"
  "bullmq":
    version: "^5.x"
    context7_id: "/taskforcesh/bullmq"
    fetched_at: "2026-07-23T11:00:50-03:00"
  "fluent-ffmpeg":
    version: "^2.1.3"
    context7_id: "/fluent-ffmpeg/fluent-ffmpeg"
    fetched_at: "2026-07-23T11:00:50-03:00"
sources_mtime:
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-07-23T10:28:40-03:00"
---

# Library References — Phase 03: Upload e Processamento de Vídeos

This document contains verified API usage patterns and documentation references for libraries introduced in Phase 03.

---

## 1. AWS SDK v3 for S3 (`@aws-sdk/client-s3` & `@aws-sdk/s3-request-presigner`)

### S3 Client Initialization (MinIO Compatible)
```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || 'http://minio:9000',
  forcePathStyle: true, // Required for MinIO
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
  },
});
```

### Presigned PUT Upload URL Generation
```typescript
const command = new PutObjectCommand({
  Bucket: process.env.S3_BUCKET_VIDEOS,
  Key: `videos/${videoSlug}/raw.mp4`,
  ContentType: mimeType,
});

const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
```

---

## 2. NestJS BullMQ (`@nestjs/bullmq` & `bullmq`)

### Module Registration
```typescript
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'redis'),
          port: configService.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    BullModule.registerQueue({
      name: 'video-processing',
    }),
  ],
})
export class VideosModule {}
```

### Queue Dispatching
```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class VideosService {
  constructor(@InjectQueue('video-processing') private videoQueue: Queue) {}

  async enqueueVideoProcessing(videoId: string, fileKey: string) {
    await this.videoQueue.add(
      'process-video',
      { videoId, fileKey },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
  }
}
```

---

## 3. FFmpeg for Media Processing (`fluent-ffmpeg`)

### Metadata Extraction
```typescript
import ffmpeg from 'fluent-ffmpeg';

function getVideoMetadata(filePath: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      resolve({
        duration: metadata.format.duration || 0,
        width: videoStream?.width || 0,
        height: videoStream?.height || 0,
      });
    });
  });
}
```
