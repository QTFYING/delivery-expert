import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserPasswordResetDto {
  @ApiPropertyOptional({ description: '重置后的密码；不传则使用系统默认密码', example: '123456' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
