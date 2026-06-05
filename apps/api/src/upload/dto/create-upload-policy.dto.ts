import { ApiProperty } from '@nestjs/swagger';
import { UploadSceneEnum } from '@shou/types/enums';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';
import type { CreateUploadPolicyRequest } from '@shou/types/contracts';

export class CreateUploadPolicyDto implements CreateUploadPolicyRequest {
  @ApiProperty({ description: '上传场景', enum: Object.values(UploadSceneEnum), example: UploadSceneEnum.USER_AVATAR })
  @IsIn(Object.values(UploadSceneEnum))
  scene!: CreateUploadPolicyRequest['scene'];

  @ApiProperty({ description: '原始文件名', example: 'avatar.png' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @ApiProperty({ description: '文件 MIME 类型', example: 'image/png' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @ApiProperty({ description: '文件大小，单位字节', example: 20480 })
  @IsInt()
  @Min(1)
  @Max(80 * 1024)
  size!: number;
}
