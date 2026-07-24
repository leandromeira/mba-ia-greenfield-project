import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  endpoint: process.env.S3_ENDPOINT || 'http://minio:9000',
  region: process.env.S3_REGION || 'us-east-1',
  accessKey: process.env.S3_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.S3_SECRET_KEY || 'minioadmin',
  bucketVideos: process.env.S3_BUCKET_VIDEOS || 'streamtube-videos',
  bucketThumbnails: process.env.S3_BUCKET_THUMBNAILS || 'streamtube-thumbnails',
}));
