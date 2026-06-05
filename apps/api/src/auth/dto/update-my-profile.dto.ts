import { ApiPropertyOptional } from '@nestjs/swagger';
import type { UpdateMyProfileRequest } from '@shou/types/contracts';
import { IsOptional, IsString, Matches } from 'class-validator';

export class UpdateMyProfileDto implements UpdateMyProfileRequest {
  @ApiPropertyOptional({
    description: '已完成上传确认的头像 uploadId；传 null 表示清空头像',
    example: 'upl_9f37f0f0f6e84e2bb9d17d1d7a9df6a1',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @Matches(/^upl_[0-9a-f]{32}$/)
  avatarUploadId?: string | null;
}
