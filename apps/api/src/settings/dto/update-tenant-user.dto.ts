import { ApiPropertyOptional } from '@nestjs/swagger';
import type { UpdateTenantUserRequest } from '@shou/types/contracts';
import { UserSimpleStatusEnum } from '@shou/types/enums';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateTenantUserDto implements UpdateTenantUserRequest {
  @ApiPropertyOptional({ description: '姓名', example: '李四' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '登录账号', example: 'operator001' })
  @IsOptional()
  @IsString()
  account?: string;

  @ApiPropertyOptional({ description: '角色 ID', example: '0c04ef8c-cfde-40a4-a553-9ab8d31a448d' })
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ description: '手机号', example: '13800138000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description: '用户状态',
    enum: Object.values(UserSimpleStatusEnum),
    example: UserSimpleStatusEnum.ACTIVE,
  })
  @IsOptional()
  @IsEnum(UserSimpleStatusEnum)
  status?: (typeof UserSimpleStatusEnum)[keyof typeof UserSimpleStatusEnum];
}
