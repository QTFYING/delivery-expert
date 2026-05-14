import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_POLICY_HINT } from '../../common/validators';

export class ChangePasswordDto {
  @ApiProperty({ description: '当前密码', example: '123456' })
  @IsString()
  @MinLength(6)
  currentPassword!: string;

  @ApiProperty({ description: PASSWORD_POLICY_HINT, example: 'Abc12345' })
  @IsString()
  @MinLength(8, { message: '密码长度必须为 8 到 20 位' })
  @MaxLength(20, { message: '密码长度必须为 8 到 20 位' })
  newPassword!: string;
}
