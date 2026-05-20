import { BadRequestException } from '@nestjs/common';
import { createSign, createVerify, randomBytes } from 'crypto';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import Decimal from 'decimal.js';
import { BusinessException } from '../../common/exceptions/business.exception';
import { decimal } from '../../common/money';

dayjs.extend(customParseFormat);

export interface LakalaSignSettings {
  lakalaAppId?: string;
  lakalaSerialNo?: string;
  lakalaPrivateKey?: string;
}

export interface LakalaVerifySettings {
  lakalaPlatformPublicKey?: string;
}

export interface LakalaWebhookContext {
  authorization?: string;
  rawBody?: string;
}

export function readLakalaString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

export function generateLakalaAuthorization(settings: LakalaSignSettings, body: unknown): string {
  const { lakalaAppId, lakalaSerialNo, lakalaPrivateKey } = settings;
  if (!lakalaAppId || !lakalaSerialNo || !lakalaPrivateKey) {
    throw new BusinessException(500, '系统尚未配置完整的拉卡拉支付参数', 500);
  }
  const nonceStr = randomBytes(6).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
  const message = `${lakalaAppId}\n${lakalaSerialNo}\n${timestamp}\n${nonceStr}\n${bodyString}\n`;

  const sign = createSign('RSA-SHA256');
  sign.update(message, 'utf8');
  const formattedKey = lakalaPrivateKey.replace(/\\n/g, '\n');
  const signature = sign.sign(formattedKey, 'base64');

  return `LKLAPI-SHA256withRSA appid="${lakalaAppId}",serial_no="${lakalaSerialNo}",timestamp="${timestamp}",nonce_str="${nonceStr}",signature="${signature}"`;
}

export function parseLakalaAuthorization(header?: string) {
  const value = readLakalaString(header);
  if (!value || !value.startsWith('LKLAPI-SHA256withRSA')) {
    return null;
  }

  const parts: Record<string, string> = {};
  const pattern = /([a-zA-Z_]+)="([^"]*)"/g;
  for (const match of value.matchAll(pattern)) {
    parts[match[1]] = match[2];
  }

  const timestamp = readLakalaString(parts.timestamp);
  const nonceStr = readLakalaString(parts.nonce_str);
  const signature = readLakalaString(parts.signature);
  if (!timestamp || !nonceStr || !signature) {
    return null;
  }

  return { timestamp, nonceStr, signature };
}

export function verifyLakalaSignature(settings: LakalaVerifySettings, context: LakalaWebhookContext): { ok: boolean; reason?: string } {
  if (!context.rawBody) {
    return { ok: false, reason: 'Webhook 缺少原始报文，无法验签' };
  }

  const authorization = parseLakalaAuthorization(context.authorization);
  if (!authorization) {
    return { ok: false, reason: 'Webhook 缺少有效 Authorization 头，无法验签' };
  }

  const { lakalaPlatformPublicKey } = settings;
  if (!lakalaPlatformPublicKey) {
    return { ok: false, reason: '未配置拉卡拉平台公钥(LAKALA_PLATFORM_PUBLIC_KEY)，无法验签' };
  }

  try {
    const verify = createVerify('RSA-SHA256');
    const messageToVerify = `${authorization.timestamp}\n${authorization.nonceStr}\n${context.rawBody}\n`;
    verify.update(messageToVerify, 'utf8');

    const formattedKey = lakalaPlatformPublicKey.replace(/\\n/g, '\n');
    const ok = verify.verify(formattedKey, authorization.signature, 'base64');
    return ok ? { ok: true } : { ok: false, reason: '拉卡拉验签未通过' };
  } catch (error) {
    return {
      ok: false,
      reason: `拉卡拉验签异常: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function parseLakalaAmount(value?: string): Decimal {
  const amount = readLakalaString(value);
  if (!amount) {
    return decimal(0);
  }

  if (!/^-?\d+$/.test(amount)) {
    throw new BadRequestException('Webhook amount is invalid');
  }

  return decimal(amount).div(100);
}

export function isLakalaSuccessStatus(status: string): boolean {
  return status.trim().toUpperCase() === 'S';
}

export function isLakalaFailureStatus(status: string): boolean {
  return ['F', 'C', 'T', 'X', 'FAIL', 'FAILED', 'CLOSED', 'CANCELLED', 'EXPIRED'].includes(status.trim().toUpperCase());
}

export function parseLakalaJsonResponse(
  text: string,
): { resp_code?: string; code?: string; resp_data?: { pay_url?: string; counter_url?: string } } & Record<string, unknown> {
  if (!text.trim()) {
    throw new BusinessException(50001, '拉卡拉预下单返回空响应', 500);
  }

  try {
    return JSON.parse(text) as {
      resp_code?: string;
      code?: string;
      resp_data?: { pay_url?: string; counter_url?: string };
    } & Record<string, unknown>;
  } catch {
    throw new BusinessException(50001, '拉卡拉预下单返回了无法解析的响应', 500);
  }
}

export function parseLakalaDateTime(value?: string): Date | undefined {
  if (!value) return undefined;
  const compact = dayjs(value, 'YYYYMMDDHHmmss', true);
  if (compact.isValid()) {
    return compact.toDate();
  }

  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.toDate() : undefined;
}
