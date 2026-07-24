import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const logger = new Logger('WorkerBootstrap');
  logger.log('Starting Video Worker Service...');
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  logger.log('Video Worker Service initialized and consuming jobs.');
}

void bootstrap();
