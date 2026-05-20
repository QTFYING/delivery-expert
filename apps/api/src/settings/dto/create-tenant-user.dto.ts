import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { TenantRoleEnum } from '@shou/types/enums';
import type { CreateTenantUserRequest } from '@shou/types/contracts';

export class CreateTenantUserDto implements CreateTenantUserRequest {
  @ApiProperty({ description: '姓名', example: '李四' })
  @IsString()
  name!: string;

  @ApiProperty({ description: '手机号/登录账号', example: '13800138000' })
  @IsString()
  phone!: string;

  @ApiProperty({ description: '角色', enum: Object.values(TenantRoleEnum), example: TenantRoleEnum.OPERATOR })
  @IsEnum(TenantRoleEnum)
  role!: (typeof TenantRoleEnum)[keyof typeof TenantRoleEnum];
}
