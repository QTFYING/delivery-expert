import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ImportWorkerModule } from './import/import-worker.module';

async function bootstrap() {
  const logger = new Logger('ImportWorker');
  const app = await NestFactory.createApplicationContext(ImportWorkerModule, {
    logger: ['log', 'error', 'warn'],
  });

  logger.log('导入任务 Worker 已启动');

  const shutdown = async (signal: string) => {
    logger.warn(`收到 ${signal}，准备关闭导入任务 Worker`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

void bootstrap();
