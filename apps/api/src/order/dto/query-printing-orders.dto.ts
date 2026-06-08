import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { PrintingOrderPrintStatusEnum, type PrintingOrderPrintStatus } from '@shou/types/enums';
import { OptionalPaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class QueryPrintingOrdersDto extends OptionalPaginationQueryDto {
  @ApiPropertyOptional({ description: '关键词，支持订单 ID / 客户名称', example: '深圳华强' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '按订单创建日期筛选单天 YYYY-MM-DD', example: '2026-06-08' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ description: '按订单创建日期筛选开始日期 YYYY-MM-DD', example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: '按订单创建日期筛选结束日期 YYYY-MM-DD', example: '2026-06-08' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    description: '打印状态筛选；不传或 all 表示全部',
    enum: Object.values(PrintingOrderPrintStatusEnum),
    example: PrintingOrderPrintStatusEnum.UNPRINTED,
  })
  @IsOptional()
  @IsEnum(PrintingOrderPrintStatusEnum)
  printStatus?: PrintingOrderPrintStatus;
}
