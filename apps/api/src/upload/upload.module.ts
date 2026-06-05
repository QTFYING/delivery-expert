import { Module } from '@nestjs/common';
import { AliyunOssAdapter } from './aliyun-oss.adapter';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

@Module({
  controllers: [UploadController],
  providers: [AliyunOssAdapter, UploadService],
  exports: [AliyunOssAdapter, UploadService],
})
export class UploadModule {}
