import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOrderPrintRecordDto {
  @ApiProperty({ description: '本次实际打印成功的订单 ID 列表', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  orderIds!: string[];

  @ApiPropertyOptional({ description: '建议填写；同租户下用于本次提交的幂等识别', example: 'print-batch-20260411-001' })
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
