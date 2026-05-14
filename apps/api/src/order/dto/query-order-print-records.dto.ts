import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PrintRecordResultEnum } from '@shou/types/enums';
import type { PrintRecordResult } from '@shou/types/enums';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class QueryOrderPrintRecordsDto {
  @ApiPropertyOptional({ description: '页码', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页条数', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 20;

  @ApiPropertyOptional({ enum: Object.values(PrintRecordResultEnum), description: '不传返回混合时间线' })
  @IsOptional()
  @IsEnum(PrintRecordResultEnum)
  result?: PrintRecordResult;

  @ApiPropertyOptional({ description: '按 printedAt 过滤起始日期 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: '按 printedAt 过滤结束日期 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class QueryTenantPrintRecordsDto extends QueryOrderPrintRecordsDto {
  @ApiPropertyOptional({ default: 50, description: '每页条数（跨订单视图默认 50）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  override pageSize?: number = 50;

  @ApiPropertyOptional({ description: '精确筛选操作人 UUID' })
  @IsOptional()
  @IsUUID()
  operatorId?: string;

  @ApiPropertyOptional({ description: '精确筛选订单 ID' })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({ description: '模糊匹配订单源单号 / 客户名称' })
  @IsOptional()
  @IsString()
  keyword?: string;
}
