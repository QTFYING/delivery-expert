import type { EnumValue } from './common';

/**
 * 短信验证码使用场景
 */
export const SmsCodeSceneEnum = {
  /** Tenant 端短信登录 */
  TENANT_LOGIN: 'tenant_login',
  /** Tenant 端短信找回密码 */
  TENANT_PASSWORD_RESET: 'tenant_password_reset',
} as const;

export type SmsCodeScene = EnumValue<typeof SmsCodeSceneEnum>;
