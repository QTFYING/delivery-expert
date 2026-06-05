import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDefined, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { OrderLineItemDto } from '../../order/dto/order-line-item.dto';
import { IMPORT_PREVIEW_MAX_ORDERS } from '../import.constants';

export class ImportPreviewOrderDto {
  @ApiProperty({ description: '源订单号', example: 'SO-20260415-001' })
  @IsString()
  @IsNotEmpty()
  sourceOrderNo!: string;

  @ApiProperty({ description: '辅助分组/防重键', example: 'SO-20260415-001', required: false })
  @IsOptional()
  @IsString()
  groupKey?: string;

  @ApiProperty({ description: '客户名称', example: '深圳华强贸易' })
  @IsString()
  @IsNotEmpty()
  customer!: string;

  @ApiPropertyOptional({ description: '客户电话；不传、null 或空字符串均按无手机号处理', example: '13800138000', nullable: true })
  @IsOptional()
  @IsString()
  customerPhone?: string | null;

  @ApiPropertyOptional({ description: '客户地址；不传、null 或空字符串均按空地址处理', example: '深圳市福田区深南大道1001号', nullable: true })
  @IsOptional()
  @IsString()
  customerAddress?: string | null;

  @ApiProperty({ description: '订单总金额（允许为 0，不允许为负数）', example: 48 })
  @IsDefined()
  totalAmount!: number | string;

  @ApiProperty({ description: '下单时间，支持 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss', example: '2026-04-15' })
  @IsString()
  @IsNotEmpty()
  orderTime!: string;

  @ApiProperty({ description: '结算方式', example: 'cash' })
  @IsString()
  @IsNotEmpty()
  payType!: string;

  @ApiProperty({
    description: '订单级模板自定义字段值，仅承载导入模板 type=list 的自定义字段',
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { cf1: 'MD001' },
  })
  @IsOptional()
  @IsObject()
  customerFieldValues?: Record<string, string>;

  @ApiProperty({ description: '订单明细', type: [OrderLineItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderLineItemDto)
  lineItems!: OrderLineItemDto[];
}

export class ImportPreviewDto {
  @ApiProperty({ description: '导入模板 ID' })
  @IsString()
  @IsNotEmpty()
  templateId!: string;

  @ApiProperty({
    description: `前端根据映射模板回填后的标准订单数组，单次最多 ${IMPORT_PREVIEW_MAX_ORDERS} 条`,
    type: [ImportPreviewOrderDto],
    maxItems: IMPORT_PREVIEW_MAX_ORDERS,
  })
  @IsArray()
  @ArrayMinSize(1, { message: '导入预检至少需要一张订单' })
  @ArrayMaxSize(IMPORT_PREVIEW_MAX_ORDERS, {
    message: `单次预检最多支持 ${IMPORT_PREVIEW_MAX_ORDERS} 条订单`,
  })
  @ValidateNested({ each: true })
  @Type(() => ImportPreviewOrderDto)
  orders!: ImportPreviewOrderDto[];
}
