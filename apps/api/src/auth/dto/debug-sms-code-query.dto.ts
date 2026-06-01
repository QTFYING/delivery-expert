import { ApiProperty } from '@nestjs/swagger';
import { SmsCodeSceneEnum, type SmsCodeScene } from '@shou/types/enums';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export class DebugSmsCodeQueryDto {
  @ApiProperty({ description: '租户用户绑定手机号', example: '13800138000' })
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  phone!: string;

  @ApiProperty({
    description: '短信验证码使用场景',
    enum: Object.values(SmsCodeSceneEnum),
    example: SmsCodeSceneEnum.TENANT_PASSWORD_RESET,
  })
  @IsEnum(SmsCodeSceneEnum)
  scene!: SmsCodeScene;
}
