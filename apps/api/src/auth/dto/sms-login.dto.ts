import { ApiProperty } from '@nestjs/swagger';
import type { SmsLoginRequest } from '@shou/types/contracts';
import { IsString, Length, MaxLength, MinLength } from 'class-validator';

export class SmsLoginDto implements SmsLoginRequest {
  @ApiProperty({ description: '租户用户绑定手机号', example: '13800138000' })
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  phone!: string;

  @ApiProperty({ description: '短信验证码', example: '123456' })
  @IsString()
  @Length(4, 8)
  code!: string;
}
