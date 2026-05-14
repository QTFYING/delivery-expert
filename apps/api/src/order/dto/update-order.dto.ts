import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrderPayTypeEnum } from '@shou/types/enums';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderLineItemDto } from './order-line-item.dto';

export class UpdateOrderDto {
  @ApiPropertyOptional({ description: '客户名称', example: '深圳华强贸易' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  customer?: string;

  @ApiPropertyOptional({ description: '客户电话；不传表示不更新，null 或空字符串均按清空手机号处理', example: '13800138000', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerPhone?: string | null;

  @ApiPropertyOptional({ description: '客户地址', example: '深圳市福田区深南大道1001号' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  customerAddress?: string;

  @ApiPropertyOptional({ description: '商品摘要', example: '农夫山泉 550ml、康师傅冰红茶' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  summary?: string;

  @ApiPropertyOptional({ description: '订单金额（元）', example: 198.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional({
    description: '付款方式',
    enum: Object.values(OrderPayTypeEnum),
    example: OrderPayTypeEnum.CASH,
  })
  @IsOptional()
  @IsEnum(OrderPayTypeEnum)
  payType?: (typeof OrderPayTypeEnum)[keyof typeof OrderPayTypeEnum];

  @ApiPropertyOptional({ description: '下单时间', example: '2026-04-10T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ description: '订单明细', type: [OrderLineItemDto] })
  @IsOptional()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrderLineItemDto)
  lineItems?: OrderLineItemDto[];

  @ApiPropertyOptional({
    description: '自定义字段键值对',
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { customerCode: 'C-001' },
  })
  @IsOptional()
  @IsObject()
  customFieldValues?: Record<string, string>;
}
