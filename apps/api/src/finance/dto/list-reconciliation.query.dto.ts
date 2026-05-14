import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { OptionalPaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListReconciliationQueryDto extends OptionalPaginationQueryDto {
  @ApiPropertyOptional({ description: '每页条数', example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  override pageSize?: number;
}
