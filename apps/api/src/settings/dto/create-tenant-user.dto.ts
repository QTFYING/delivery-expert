import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CreateTenantUserRequest } from '@shou/types/contracts';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTenantUserDto implements CreateTenantUserRequest {
  @ApiProperty({ description: '姓名', example: '李四' })
  @IsString()
  name!: string;

  @ApiProperty({ description: '手机号', example: '13800138000' })
  @IsString()
  phone!: string;

  @ApiPropertyOptional({ description: '登录账号；未提交时服务端使用手机号', example: 'operator001' })
  @IsOptional()
  @IsString()
  account?: string;

  @ApiProperty({ description: '角色 ID', example: '0c04ef8c-cfde-40a4-a553-9ab8d31a448d' })
  @IsUUID()
  roleId!: string;
}
