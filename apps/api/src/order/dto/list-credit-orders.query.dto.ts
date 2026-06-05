import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { OrderSearchStatusEnum, type OrderSearchStatus } from '@shou/types/enums';
import { OptionalPaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListCreditOrdersQueryDto extends OptionalPaginationQueryDto {
  @ApiPropertyOptional({
    description: '账期列表订单状态筛选；本期仅开放待收款、已收款、已过期',
    enum: Object.values(OrderSearchStatusEnum),
    example: OrderSearchStatusEnum.PENDING,
  })
  @IsOptional()
  @IsEnum(OrderSearchStatusEnum)
  status?: OrderSearchStatus;
}
