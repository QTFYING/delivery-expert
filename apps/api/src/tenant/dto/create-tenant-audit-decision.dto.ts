import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReviewActionEnum } from '@shou/types/enums';

export class CreateTenantAuditDecisionDto {
  @ApiProperty({ description: '审核动作', enum: Object.values(ReviewActionEnum), example: ReviewActionEnum.APPROVE })
  @IsEnum(ReviewActionEnum)
  action!: (typeof ReviewActionEnum)[keyof typeof ReviewActionEnum];

  @ApiPropertyOptional({ description: '审核备注', example: '资料齐全，审核通过' })
  @IsOptional()
  @IsString()
  reviewNote?: string;

  @ApiPropertyOptional({ description: '驳回原因', example: '营业执照不清晰' })
  @IsOptional()
  @IsString()
  rejectReason?: string;
}
