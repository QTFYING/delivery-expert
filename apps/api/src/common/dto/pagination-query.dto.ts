import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** 可选分页查询基类 */
export abstract class OptionalPaginationQueryDto {
  @ApiPropertyOptional({ description: '页码', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: '每页条数', example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

/** 必填分页查询基类 */
export abstract class RequiredPaginationQueryDto {
  @ApiProperty({ description: '页码', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page!: number;

  @ApiProperty({ description: '每页条数', example: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize!: number;
}
