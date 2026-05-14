import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { OptionalPaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListPaymentsQueryDto extends OptionalPaginationQueryDto {
  @ApiPropertyOptional({ description: '关键字，支持客户名/订单号等', example: 'ERP20260410' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '支付渠道', example: 'lakala' })
  @IsOptional()
  @IsString()
  channel?: string;
}
