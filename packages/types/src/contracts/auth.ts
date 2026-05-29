import type { TenantPermissionCode } from '../enums';

export interface LoginRequest {
  /** 登录账号 */
  account: string;
  /** 登录密码 */
  password: string;
}

export interface ChangePasswordRequest {
  /** 当前密码 */
  currentPassword: string;
  /** 新密码 */
  newPassword: string;
}

export interface AuthUserProfile {
  /** 用户 ID */
  id: string;
  /** 登录账号 */
  account: string;
  /** 用户姓名 */
  realName: string;
  /** 所属租户 ID；平台用户为 `null` */
  tenantId: string | null;
  /** 是否要求先修改密码 */
  requiresPasswordReset: boolean;
}

export interface LoginResponse {
  /** 访问令牌 */
  accessToken: string;
  /** 令牌有效期，单位秒 */
  expiresIn: number;
  /** 当前登录用户信息 */
  user: AuthUserProfile;
}

export interface RefreshTokenResponse {
  /** 新的访问令牌 */
  accessToken: string;
  /** 新令牌有效期，单位秒 */
  expiresIn: number;
}

export interface AuthMeResponse extends AuthUserProfile {
  /** 当前角色 ID；平台用户可为空 */
  roleId: string | null;
  /** 当前角色编码；平台用户可返回 OS_SUPER_ADMIN */
  roleCode: string | null;
  /** 当前角色名称 */
  roleName: string | null;
  /** 当前用户拥有的 Tenant 权限编码列表 */
  permissions: TenantPermissionCode[];
  /** 当前用户权限版本 */
  permissionVersion: number;
}
