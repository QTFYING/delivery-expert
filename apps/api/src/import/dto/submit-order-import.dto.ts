import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { OrderImportConflictPolicyEnum } from '@shou/types/enums';

export class SubmitOrderImportDto {
  @ApiProperty({ description: '预检批次 ID' })
  @IsString()
  @IsNotEmpty()
  previewId!: string;

  @ApiPropertyOptional({
    description: '重复订单冲突策略',
    enum: Object.values(OrderImportConflictPolicyEnum),
    example: OrderImportConflictPolicyEnum.SKIP,
  })
  @IsOptional()
  @IsIn(Object.values(OrderImportConflictPolicyEnum))
  conflictPolicy?: (typeof OrderImportConflictPolicyEnum)[keyof typeof OrderImportConflictPolicyEnum];
}
