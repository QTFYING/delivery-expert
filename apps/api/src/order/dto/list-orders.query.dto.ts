import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { CreditTypeEnum, OrderPayTypeEnum, OrderSearchStatusEnum, type OrderSearchStatus } from '@shou/types/enums';
import { OptionalPaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListOrdersQueryDto extends OptionalPaginationQueryDto {
  @ApiPropertyOptional({ description: '关键字，支持客户名/原始订单号等', example: 'ERP20260410' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({
    description: '订单状态筛选；本期仅开放待收款、已收款、已过期，partial/voided 不作为搜索条件',
    enum: Object.values(OrderSearchStatusEnum),
    example: OrderSearchStatusEnum.PAID,
  })
  @IsOptional()
  @IsEnum(OrderSearchStatusEnum)
  status?: OrderSearchStatus;

  @ApiPropertyOptional({
    description: '付款方式',
    enum: Object.values(OrderPayTypeEnum),
    example: OrderPayTypeEnum.CREDIT,
  })
  @IsOptional()
  @IsEnum(OrderPayTypeEnum)
  payType?: (typeof OrderPayTypeEnum)[keyof typeof OrderPayTypeEnum];

  @ApiPropertyOptional({
    description: '账期子类型；有值时仅适用于 payType=credit',
    enum: Object.values(CreditTypeEnum),
    example: CreditTypeEnum.MONTH,
  })
  @IsOptional()
  @IsEnum(CreditTypeEnum)
  creditType?: (typeof CreditTypeEnum)[keyof typeof CreditTypeEnum];

  @ApiPropertyOptional({ description: '导入映射模板 ID', example: '1' })
  @IsOptional()
  @IsString()
  mappingTemplateId?: string;

  @ApiPropertyOptional({ description: '开始日期', example: '2026-04-01' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: '结束日期', example: '2026-04-30' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
