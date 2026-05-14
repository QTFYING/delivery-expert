import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReviewActionEnum } from '@shou/types/enums';

export class CreateTenantCertificationReviewDecisionDto {
  @ApiProperty({ description: '审核动作', enum: Object.values(ReviewActionEnum), example: ReviewActionEnum.APPROVE })
  @IsEnum(ReviewActionEnum)
  action!: (typeof ReviewActionEnum)[keyof typeof ReviewActionEnum];

  @ApiPropertyOptional({ description: '审核备注', example: '进入下一审核阶段' })
  @IsOptional()
  @IsString()
  comment?: string;
}
