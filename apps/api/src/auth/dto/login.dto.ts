import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: '登录账号', example: 'admin' })
  @IsString()
  @IsNotEmpty()
  account!: string;

  @ApiProperty({ description: '登录密码', example: '123456' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
