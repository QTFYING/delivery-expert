import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { ListOrdersQueryDto } from './list-orders.query.dto';

export class ExportOrdersQueryDto extends ListOrdersQueryDto {
  @ApiPropertyOptional({ description: '指定导出的订单 ID 列表；不传则按筛选条件导出', type: [String], example: ['O-1001', 'O-1002'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];
}
