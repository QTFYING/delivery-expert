import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { RequiredPaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListUsersQueryDto extends RequiredPaginationQueryDto {
  @ApiPropertyOptional({ description: '关键字', example: '管理员A' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '租户关键字', example: '平台' })
  @IsOptional()
  @IsString()
  tenant?: string;

  @ApiPropertyOptional({ description: '角色关键字', example: 'OS_SUPER_ADMIN' })
  @IsOptional()
  @IsString()
  role?: string;
}
