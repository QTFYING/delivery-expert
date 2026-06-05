import { ApiProperty } from '@nestjs/swagger';
import type { CompleteUploadResponse, UploadPolicyResponse } from '@shou/types/contracts';
import { UploadSceneEnum } from '@shou/types/enums';

export class UploadPolicyResponseSwagger implements UploadPolicyResponse {
  @ApiProperty({ description: '上传记录 ID', example: 'upl_9f37f0f0f6e84e2bb9d17d1d7a9df6a1' })
  uploadId!: string;

  @ApiProperty({ description: '上传场景', enum: Object.values(UploadSceneEnum), example: UploadSceneEnum.USER_AVATAR })
  scene!: UploadPolicyResponse['scene'];

  @ApiProperty({ description: 'OSS 直传方式', example: 'post' })
  method!: 'post';

  @ApiProperty({ description: 'OSS 表单提交地址', example: 'https://bucket.oss-cn-hangzhou.aliyuncs.com' })
  host!: string;

  @ApiProperty({ description: '服务端生成的 OSS object key', example: 'avatars/T000000001/upl_xxx.png' })
  objectKey!: string;

  @ApiProperty({ description: '公开访问 URL', example: 'https://cdn.example.com/avatars/T000000001/upl_xxx.png' })
  publicUrl!: string;

  @ApiProperty({ description: 'OSS POST 表单字段', type: Object })
  formData!: Record<string, string>;

  @ApiProperty({ description: '上传凭证过期时间', example: '2026-06-04T08:00:00.000Z' })
  expiresAt!: string;
}

export class CompleteUploadResponseSwagger implements CompleteUploadResponse {
  @ApiProperty({ description: '上传记录 ID', example: 'upl_9f37f0f0f6e84e2bb9d17d1d7a9df6a1' })
  uploadId!: string;

  @ApiProperty({ description: '上传场景', enum: Object.values(UploadSceneEnum), example: UploadSceneEnum.USER_AVATAR })
  scene!: CompleteUploadResponse['scene'];

  @ApiProperty({ description: 'OSS object key', example: 'avatars/T000000001/upl_xxx.png' })
  objectKey!: string;

  @ApiProperty({ description: '公开访问 URL', example: 'https://cdn.example.com/avatars/T000000001/upl_xxx.png' })
  publicUrl!: string;

  @ApiProperty({ description: '上传状态', example: 'uploaded' })
  status!: 'uploaded';

  @ApiProperty({ description: '上传完成确认时间', example: '2026-06-04T08:00:00.000Z' })
  uploadedAt!: string;
}
