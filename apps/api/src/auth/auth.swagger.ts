import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  AuthMeResponse as AuthMeResponseContract,
  AuthUserProfile as AuthUserProfileContract,
  LoginResponse as LoginResponseContract,
  RefreshTokenResponse as RefreshTokenResponseContract,
} from '@shou/types/contracts';
import { AuthSourceTagEnum, UserRoleEnum } from '@shou/types/enums';

export class AuthUserProfileSwagger implements AuthUserProfileContract {
  @ApiProperty({ description: '用户 ID', example: '8d5d4f78-5c25-4bc6-bf6c-64061edc3079' })
  id!: string;

  @ApiProperty({ description: '登录账号', example: 'operator001' })
  account!: string;

  @ApiProperty({ description: '用户姓名', example: '张三' })
  realName!: string;

  @ApiProperty({ description: '当前主角色', enum: Object.values(UserRoleEnum), example: UserRoleEnum.TENANT_OPERATOR })
  role!: AuthUserProfileContract['role'];

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
    description: '数据来源标记',
    enum: Object.values(AuthSourceTagEnum),
    example: AuthSourceTagEnum.REMOTE,
  })
  source?: AuthMeResponseContract['source'];
}
