import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { SendSmsCodeRequest } from '@shou/types/contracts';
import { SmsCodeSceneEnum, type SmsCodeScene } from '@shou/types/enums';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendSmsCodeDto implements SendSmsCodeRequest {
  @ApiProperty({ description: '租户用户绑定手机号', example: '13800138000' })
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  phone!: string;

  @ApiProperty({
    description: '短信验证码使用场景',
    enum: Object.values(SmsCodeSceneEnum),
    example: SmsCodeSceneEnum.TENANT_LOGIN,
  })
  @IsEnum(SmsCodeSceneEnum)
  scene!: SmsCodeScene;

  @ApiPropertyOptional({ description: '阿里云验证码 2.0 前端校验结果' })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  captchaVerifyParam?: string;
}
