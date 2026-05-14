import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { RequiredPaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListAuditLogsQueryDto extends RequiredPaginationQueryDto {
  @ApiPropertyOptional({ description: '开始日期', example: '2026-04-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: '结束日期', example: '2026-04-30' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: '操作人关键字', example: '张三' })
  @IsOptional()
  @IsString()
  operator?: string;
}
