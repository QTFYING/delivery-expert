import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOrderPrintRecordDto {
  @ApiPropertyOptional({ description: '推荐使用；本次实际打印成功的单张订单 ID', example: 'ORD20260411000001' })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({
    description: '兼容旧前端；仅允许传入 1 个订单 ID，后续请改用 orderId',
    type: [String],
    deprecated: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1)
  @IsString({ each: true })
  orderIds?: string[];

  @ApiPropertyOptional({ description: '建议填写；同租户下用于本次单订单打印回执的幂等识别', example: 'print-order-20260411-001' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  requestId?: string;

  @ApiPropertyOptional({ description: '备注', example: '一联打印成功' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}
