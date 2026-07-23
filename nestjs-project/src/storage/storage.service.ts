import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import storageConfig from '../config/storage.config';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;

  constructor(
    @Inject(storageConfig.KEY)
    private readonly config: ConfigType<typeof storageConfig>,
  ) {
    this.s3Client = new S3Client({
      endpoint: this.config.endpoint,
      region: this.config.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.accessKey,
        secretAccessKey: this.config.secretKey,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucketExists(this.config.bucketVideos);
    await this.ensureBucketExists(this.config.bucketThumbnails);
  }

  async ensureBucketExists(bucketName: string): Promise<void> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    } catch (error: unknown) {
      const err = error as {
        $metadata?: { httpStatusCode?: number };
        name?: string;
        code?: string;
      };
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') {
        this.logger.log(`Bucket ${bucketName} not found. Creating...`);
        try {
          await this.s3Client.send(
            new CreateBucketCommand({ Bucket: bucketName }),
          );
          this.logger.log(`Bucket ${bucketName} created successfully.`);
        } catch (createErr) {
          this.logger.warn(
            `Could not create bucket ${bucketName}: ${createErr}`,
          );
        }
      } else if (
        err?.name === 'EndpointConnectionError' ||
        err?.code === 'ENOTFOUND' ||
        err?.code === 'ECONNREFUSED' ||
        (error as Error)?.message?.includes('ENOTFOUND')
      ) {
        this.logger.warn(
          `Storage endpoint not reachable at ${this.config.endpoint}. Skipping bucket creation.`,
        );
      } else {
        throw error;
      }
    }
  }

  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn = 3600,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucketVideos,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async getPresignedDownloadUrl(
    key: string,
    filename: string,
    expiresIn = 3600,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucketVideos,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async getObjectStream(
    bucket: string,
    key: string,
    range?: string,
  ): Promise<{
    stream: Readable;
    contentLength?: number;
    contentRange?: string;
    contentType?: string;
  }> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      Range: range,
    });
    const response = await this.s3Client.send(command);
    return {
      stream: response.Body as Readable,
      contentLength: response.ContentLength,
      contentRange: response.ContentRange,
      contentType: response.ContentType,
    };
  }

  async uploadObject(
    bucket: string,
    key: string,
    body: Buffer | Readable,
    contentType: string,
  ): Promise<void> {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }
}
