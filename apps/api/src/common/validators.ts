import { BadRequestException } from '@nestjs/common';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 20;
const PASSWORD_CATEGORY_PATTERNS = [/[A-Z]/, /[a-z]/, /\d/, /[^A-Za-z0-9\s]/];
const COMMON_WEAK_PASSWORDS = new Set([
  '123456',
  '12345678',
  '123456789',
  '00000000',
  '11111111',
  '66666666',
  '88888888',
  'password',
  'password123',
  'admin123',
  'qwerty123',
]);

export const PASSWORD_POLICY_HINT = '密码必须为 8 到 20 位 且至少包含大写字母 小写字母 数字 特殊字符中的 2 类 不能包含空格 不能是常见弱口令';

export function normalizePage(value?: number): number {
  return value && value > 0 ? value : 1;
}

export function normalizePageSize(value?: number): number {
  if (!value || value <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(value, MAX_PAGE_SIZE);
}

export function normalizePositiveInt(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`${label} 必须是正整数`);
  }

  return value;
}

export function cut(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

export function normalizeText(value: string, label: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new BadRequestException(`${label} 不能为空`);
  }

  return cut(trimmed, max);
}

export function normalizeNullableText(value: unknown, max: number): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }

  return cut(trimmed, max);
}

export function normalizeOptionalText(value: unknown, max?: number): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return undefined;
  }

  return max === undefined ? trimmed : cut(trimmed, max);
}

export function normalizeIdArray(values: string[], label: string): string[] {
  const normalized = Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
  if (normalized.length === 0) {
    throw new BadRequestException(`${label} 不能为空`);
  }

  return normalized;
}

export function parseDate(value: string | undefined, label: string): Date | undefined {
  if (!value) return undefined;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${label} 不是合法日期`);
  }

  return date;
}

export function assertPasswordStrength(value: string): string {
  if (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) {
    throw new BadRequestException('密码长度必须为 8 到 20 位');
  }

  if (/\s/.test(value)) {
    throw new BadRequestException('密码不能包含空格');
  }

  const matchedCategoryCount = PASSWORD_CATEGORY_PATTERNS.filter((pattern) => pattern.test(value)).length;
  if (matchedCategoryCount < 2) {
    throw new BadRequestException('密码至少包含大写字母 小写字母 数字 特殊字符中的 2 类');
  }

  if (COMMON_WEAK_PASSWORDS.has(value.toLowerCase())) {
    throw new BadRequestException('密码不能是常见弱口令');
  }

  return value;
}

export function formatDateTime(value: Date): string;
export function formatDateTime(value: Date | null | undefined): string | undefined;
export function formatDateTime(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}
