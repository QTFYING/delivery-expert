import type { SmsCodeScene } from '@shou/types/enums';

export interface SendSmsVerificationCodeInput {
  phone: string;
  scene: SmsCodeScene;
  code: string;
  validMinutes: number;
  outId?: string;
}

export interface SendSmsVerificationCodeResult {
  sent: boolean;
  provider: 'aliyun-pnvs' | 'disabled';
  requestId?: string;
  bizId?: string;
  message?: string;
}

export interface VerifyCaptchaInput {
  captchaVerifyParam?: string;
}

export interface VerifyCaptchaResult {
  enabled: boolean;
  verified: boolean;
  requestId?: string;
  message?: string;
}

export interface IssueSmsCodeInput {
  phone: string;
  scene: SmsCodeScene;
  ip?: string;
}

export interface IssueSmsCodeResult {
  code: string;
  validMinutes: number;
  expiresInSeconds: number;
}

export interface ConsumeSmsCodeInput {
  phone: string;
  scene: SmsCodeScene;
  code: string;
}

export type ConsumeSmsCodeFailureReason = 'not_found' | 'mismatch' | 'too_many_attempts';

export type ConsumeSmsCodeResult =
  | { consumed: true }
  | {
      consumed: false;
      reason: ConsumeSmsCodeFailureReason;
      remainingAttempts: number;
    };

export interface DebugSmsCodeLookupInput {
  phone: string;
  scene: SmsCodeScene;
}

export interface ClearSmsCodeInput extends DebugSmsCodeLookupInput {
  clearCooldown?: boolean;
}

export interface DebugSmsCodeLookupResult {
  code: string;
  expiresInSeconds: number;
}
