import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderPayTypeEnum, OrderStatusEnum } from '@shou/types/enums';
import { OptionalPaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListOrdersQueryDto extends OptionalPaginationQueryDto {
  @ApiPropertyOptional({ description: '关键字，支持客户名/原始订单号等', example: 'ERP20260410' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '订单状态', enum: Object.values(OrderStatusEnum), example: OrderStatusEnum.PAID })
  @IsOptional()
  @IsEnum(OrderStatusEnum)
  status?: (typeof OrderStatusEnum)[keyof typeof OrderStatusEnum];

  @ApiPropertyOptional({
    description: '付款方式',
    enum: Object.values(OrderPayTypeEnum),
    example: OrderPayTypeEnum.CREDIT,
  })
  @IsOptional()
  @IsEnum(OrderPayTypeEnum)
  payType?: (typeof OrderPayTypeEnum)[keyof typeof OrderPayTypeEnum];

  @ApiPropertyOptional({ description: '导入模板 ID', example: '1' })
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiPropertyOptional({ description: '开始日期', example: '2026-04-01' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: '结束日期', example: '2026-04-30' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
