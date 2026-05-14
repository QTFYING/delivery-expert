import { ApiProperty } from '@nestjs/swagger';

/** 通用分页响应元信息。 */
export abstract class PaginatedResponseMetaSwagger {
  @ApiProperty({ description: '总数', example: 20 })
  total!: number;

  @ApiProperty({ description: '当前页', example: 1 })
  page!: number;

  @ApiProperty({ description: '每页条数', example: 20 })
  pageSize!: number;
}
