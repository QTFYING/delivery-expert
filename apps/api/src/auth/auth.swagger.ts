import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  AuthMeResponse as AuthMeResponseContract,
  AuthUserProfile as AuthUserProfileContract,
  LoginResponse as LoginResponseContract,
  RefreshTokenResponse as RefreshTokenResponseContract,
} from '@shou/types/contracts';
import { TenantPermissionCodeEnum, UserRoleEnum } from '@shou/types/enums';

export class AuthUserProfileSwagger implements AuthUserProfileContract {
  @ApiProperty({ description: '用户 ID', example: '8d5d4f78-5c25-4bc6-bf6c-64061edc3079' })
  id!: string;

  @ApiProperty({ description: '登录账号', example: 'operator001' })
  account!: string;

  @ApiProperty({ description: '用户姓名', example: '张三' })
  realName!: string;

  @ApiPropertyOptional({
    description: '所属租户 ID；平台用户为空',
    example: '7c5a5fb1-c7a4-4f2e-b2dc-5de8dc7833a9',
    nullable: true,
  })
  tenantId!: string | null;

  @ApiProperty({ description: '是否要求先修改密码', example: false })
  requiresPasswordReset!: boolean;
}

export class LoginResponseSwagger implements LoginResponseContract {
  @ApiProperty({ description: '访问令牌' })
  accessToken!: string;

  @ApiProperty({ description: '令牌有效期（秒）', example: 7200 })
  expiresIn!: number;

  @ApiProperty({ description: '当前登录用户信息', type: AuthUserProfileSwagger })
  user!: AuthUserProfileSwagger;
}

export class RefreshTokenResponseSwagger implements RefreshTokenResponseContract {
  @ApiProperty({ description: '新的访问令牌' })
  accessToken!: string;

  @ApiProperty({ description: '令牌有效期（秒）', example: 7200 })
  expiresIn!: number;
}

export class AuthMeResponseSwagger extends AuthUserProfileSwagger implements AuthMeResponseContract {
  @ApiPropertyOptional({
    description: '当前角色 ID；平台用户为空',
    example: '0c04ef8c-cfde-40a4-a553-9ab8d31a448d',
    nullable: true,
  })
  roleId!: string | null;

  @ApiPropertyOptional({
    description: '当前角色编码；平台用户可返回 OS_SUPER_ADMIN',
    example: UserRoleEnum.OS_SUPER_ADMIN,
    nullable: true,
  })
  roleCode!: string | null;

  @ApiPropertyOptional({ description: '当前角色名称', example: '平台超级管理员', nullable: true })
  roleName!: string | null;

  @ApiProperty({
    description: '当前用户拥有的 Tenant 权限编码列表',
    enum: Object.values(TenantPermissionCodeEnum),
    isArray: true,
    example: [TenantPermissionCodeEnum.ORDERS_READ, TenantPermissionCodeEnum.PAYMENTS_READ],
  })
  permissions!: AuthMeResponseContract['permissions'];

  @ApiProperty({ description: '当前用户权限版本', example: 3 })
  permissionVersion!: number;
}
