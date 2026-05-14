import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { SortOrderEnum, TenantSortFieldEnum, TenantStatusEnum } from '@shou/types/enums';
import { RequiredPaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListTenantsQueryDto extends RequiredPaginationQueryDto {
  @ApiPropertyOptional({ description: '关键字', example: '华南一区' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({
    description: '租户状态',
    enum: Object.values(TenantStatusEnum),
    example: TenantStatusEnum.ACTIVE,
  })
  @IsOptional()
  @IsEnum(TenantStatusEnum)
  status?: (typeof TenantStatusEnum)[keyof typeof TenantStatusEnum];

  @ApiPropertyOptional({
    description: '排序字段',
    enum: Object.values(TenantSortFieldEnum),
    example: TenantSortFieldEnum.NAME,
  })
  @IsOptional()
  @IsEnum(TenantSortFieldEnum)
  sortBy?: (typeof TenantSortFieldEnum)[keyof typeof TenantSortFieldEnum];

  @ApiPropertyOptional({ description: '排序方向', enum: Object.values(SortOrderEnum), example: SortOrderEnum.DESC })
  @IsOptional()
  @IsEnum(SortOrderEnum)
  sortOrder?: (typeof SortOrderEnum)[keyof typeof SortOrderEnum];
}
