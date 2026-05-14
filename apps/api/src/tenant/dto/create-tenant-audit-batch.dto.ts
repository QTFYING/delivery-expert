import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsOptional, IsString } from 'class-validator';

export class CreateTenantAuditBatchDto {
  @ApiProperty({ description: '租户 ID 列表', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];

  @ApiProperty({ description: '批量动作，当前仅支持 approve', example: 'approve' })
  @IsString()
  action!: 'approve';

  @ApiPropertyOptional({ description: '审核备注', example: '批量通过初审' })
  @IsOptional()
  @IsString()
  reviewNote?: string;
}
