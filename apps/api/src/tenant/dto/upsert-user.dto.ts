import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TenantSideEnum, UserStatusEnum } from '@shou/types/enums';

export class UpsertUserDto {
  @ApiProperty({ description: '姓名', example: '平台管理员A' })
  @IsString()
  name!: string;

  @ApiProperty({ description: '账号', example: 'admin001' })
  @IsString()
  account!: string;

  @ApiProperty({ description: '手机号', example: '13800138000' })
  @IsString()
  phone!: string;

  @ApiProperty({ description: '所属侧', enum: Object.values(TenantSideEnum), example: TenantSideEnum.PLATFORM })
  @IsEnum(TenantSideEnum)
  tenantType!: (typeof TenantSideEnum)[keyof typeof TenantSideEnum];

  @ApiProperty({ description: '所属租户或平台标识', example: '平台' })
  @IsString()
  tenant!: string;

  @ApiProperty({ description: '角色', example: 'OS_SUPER_ADMIN' })
  @IsString()
  role!: string;

  @ApiProperty({ description: '作用域', example: 'platform:all' })
  @IsString()
  scope!: string;

  @ApiPropertyOptional({ description: '状态', enum: Object.values(UserStatusEnum), example: UserStatusEnum.ACTIVE })
  @IsOptional()
  @IsEnum(UserStatusEnum)
  status?: (typeof UserStatusEnum)[keyof typeof UserStatusEnum];
}
