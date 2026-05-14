import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TenantRoleEnum, UserSimpleStatusEnum } from '@shou/types/enums';

export class UpdateTenantUserDto {
  @ApiPropertyOptional({ description: '姓名', example: '李四' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '登录账号', example: '13800138000' })
  @IsOptional()
  @IsString()
  account?: string;

  @ApiPropertyOptional({ description: '角色', enum: Object.values(TenantRoleEnum), example: TenantRoleEnum.FINANCE })
  @IsOptional()
  @IsEnum(TenantRoleEnum)
  role?: (typeof TenantRoleEnum)[keyof typeof TenantRoleEnum];

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
