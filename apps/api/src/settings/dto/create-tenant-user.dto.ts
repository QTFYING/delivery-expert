import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TenantRoleEnum } from '@shou/types/enums';
import { PASSWORD_POLICY_HINT } from '../../common/validators';

export class CreateTenantUserDto {
  @ApiProperty({ description: '姓名', example: '李四' })
  @IsString()
  name!: string;

  @ApiProperty({ description: '手机号/登录账号', example: '13800138000' })
  @IsString()
  phone!: string;

  @ApiProperty({ description: '角色', enum: Object.values(TenantRoleEnum), example: TenantRoleEnum.OPERATOR })
  @IsEnum(TenantRoleEnum)
  role!: (typeof TenantRoleEnum)[keyof typeof TenantRoleEnum];

  @ApiPropertyOptional({ description: `${PASSWORD_POLICY_HINT} 不传则默认 123456`, example: 'Abc12345' })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: '密码长度必须为 8 到 20 位' })
  @MaxLength(20, { message: '密码长度必须为 8 到 20 位' })
  password?: string;
}
