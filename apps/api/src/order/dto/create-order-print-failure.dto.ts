import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOrderPrintFailureDto {
  @ApiProperty({ description: '打印失败原因，如"打印机卡纸"、"驱动超时"', maxLength: 500 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ description: '建议填写；同租户下用于单条失败的幂等识别' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  requestId?: string;

  @ApiPropertyOptional({ description: '备注，预留扩展' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}
