import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class OrderLineItemDto {
  @ApiPropertyOptional({ description: '行项目 ID' })
  @IsOptional()
  @IsString()
  itemId?: string;

  @ApiPropertyOptional({ description: '商品主数据 ID', example: 'SKU-001' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  skuId?: string | null;

  @ApiPropertyOptional({ description: '商品名称（导入预检允许为空，订单创建必填）', example: '农夫山泉 550ml' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  skuName?: string;

  @ApiPropertyOptional({ description: '商品规格', example: '24瓶/箱' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  skuSpec?: string;

  @ApiPropertyOptional({ description: '单位（导入预检允许为空，订单创建必填）', example: '箱' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional({ description: '数量（导入预检允许为空，订单创建必填）', example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ description: '单价（元，导入预检允许为空，订单创建必填）', example: 48.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional({ description: '行金额（元，导入预检允许为空，订单创建必填）', example: 97 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  lineAmount?: number;
}
