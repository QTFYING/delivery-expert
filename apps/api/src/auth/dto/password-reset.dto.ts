import { ApiProperty } from '@nestjs/swagger';
import type { PasswordResetRequest } from '@shou/types/contracts';
import { IsString, Length, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_POLICY_HINT } from '../../common/validators';

export class PasswordResetDto implements PasswordResetRequest {
  @ApiProperty({ description: '租户用户绑定手机号', example: '13800138000' })
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  phone!: string;

  @ApiProperty({ description: '短信验证码', example: '123456' })
  @IsString()
  @Length(4, 8)
  code!: string;

  @ApiProperty({ description: PASSWORD_POLICY_HINT, example: 'Abc12345' })
  @IsString()
  @MinLength(8, { message: '密码长度必须为 8 到 20 位' })
  @MaxLength(20, { message: '密码长度必须为 8 到 20 位' })
  newPassword!: string;
}
