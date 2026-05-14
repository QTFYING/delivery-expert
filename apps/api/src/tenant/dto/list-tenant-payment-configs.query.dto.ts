import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TenantPaymentConfigStatusEnum, TenantStatusEnum } from '@shou/types/enums';
import { RequiredPaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListTenantPaymentConfigsQueryDto extends RequiredPaginationQueryDto {
  @ApiPropertyOptional({ description: '关键字', example: '华南一区' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({
    description: '收单配置状态',
    enum: Object.values(TenantPaymentConfigStatusEnum),
    example: TenantPaymentConfigStatusEnum.AVAILABLE,
  })
  @IsOptional()
  @IsEnum(TenantPaymentConfigStatusEnum)
  status?: (typeof TenantPaymentConfigStatusEnum)[keyof typeof TenantPaymentConfigStatusEnum];

  @ApiPropertyOptional({
    description: '租户状态',
    enum: Object.values(TenantStatusEnum),
    example: TenantStatusEnum.ACTIVE,
  })
  @IsOptional()
  @IsEnum(TenantStatusEnum)
  tenantStatus?: (typeof TenantStatusEnum)[keyof typeof TenantStatusEnum];
}
