import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { TenantSideEnum } from '@shou/types/enums';
import { OptionalPaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListTenantMembersQueryDto extends OptionalPaginationQueryDto {
  @ApiPropertyOptional({
    description: '所属侧筛选',
    enum: Object.values(TenantSideEnum),
    example: TenantSideEnum.TENANT,
  })
  @IsOptional()
  @IsEnum(TenantSideEnum)
  tenantType?: (typeof TenantSideEnum)[keyof typeof TenantSideEnum];
}
