import type { EnumValue } from './common';

/**
 * 平台角色
 */
export const PlatformRoleEnum = {
  /** 平台超级管理员 */
  SUPER_ADMIN: 'OS_SUPER_ADMIN',
} as const;

export type PlatformRole = EnumValue<typeof PlatformRoleEnum>;

/**
 * 租户角色
 */
export const TenantRoleEnum = {
  /** 老板 */
  OWNER: 'TENANT_OWNER',
  /** 打单员 */
  OPERATOR: 'TENANT_OPERATOR',
  /** 财务 */
  FINANCE: 'TENANT_FINANCE',
  /** 访客/只读 */
  VIEWER: 'TENANT_VIEWER',
} as const;

export type TenantRole = EnumValue<typeof TenantRoleEnum>;

/**
 * 系统用户角色
 */
export const UserRoleEnum = {
  /** 平台超级管理员 */
  OS_SUPER_ADMIN: 'OS_SUPER_ADMIN',
  /** 老板 */
  TENANT_OWNER: 'TENANT_OWNER',
  /** 打单员 */
  TENANT_OPERATOR: 'TENANT_OPERATOR',
  /** 财务 */
  TENANT_FINANCE: 'TENANT_FINANCE',
  /** 访客/只读 */
  TENANT_VIEWER: 'TENANT_VIEWER',
} as const;

export type UserRole = EnumValue<typeof UserRoleEnum>;

/**
 * 租户状态
 */
export const TenantStatusEnum = {
  /** 正常活跃 */
  ACTIVE: 'active',
  /** 初始化或资料待审 */
  ONBOARDING: 'onboarding',
  /** 临近过期提醒 */
  ATTENTION: 'attention',
  /** 冻结或停用 */
  PAUSED: 'paused',
} as const;

export type TenantStatus = EnumValue<typeof TenantStatusEnum>;

/**
 * 租户采购的软件版本级别
 */
export const TenantSoftwareVersionEnum = {
  /** L1 基础版本 */
  L1: 'L1',
  /** L2 标准版本 */
  L2: 'L2',
  /** L3 高级版本 */
  L3: 'L3',
} as const;

export type TenantSoftwareVersion = EnumValue<typeof TenantSoftwareVersionEnum>;

/**
 * 用户状态
 */
export const UserStatusEnum = {
  /** 正常 */
  ACTIVE: 'active',
  /** 已邀请未激活 */
  INVITED: 'invited',
  /** 已锁定 */
  LOCKED: 'locked',
  /** 已禁用 */
  DISABLED: 'disabled',
} as const;

export type UserStatus = EnumValue<typeof UserStatusEnum>;

/**
 * 租户列表排序字段
 */
export const TenantSortFieldEnum = {
  /** 按租户名称排序 */
  NAME: 'name',
  /** 按采购软件版本排序 */
  SOFTWARE_VERSION: 'softwareVersion',
  /** 按租户状态排序 */
  STATUS: 'status',
  /** 按距到期天数排序 */
  DUE_IN_DAYS: 'dueInDays',
} as const;

export type TenantSortField = EnumValue<typeof TenantSortFieldEnum>;

/**
 * 租户资质审核状态
 */
export const TenantCertificationStatusEnum = {
  /** 待初审 */
  PENDING_INITIAL_REVIEW: 'pending_initial_review',
  /** 待复核 */
  PENDING_SECONDARY_REVIEW: 'pending_secondary_review',
  /** 待确认 */
  PENDING_CONFIRMATION: 'pending_confirmation',
  /** 已通过 */
  APPROVED: 'approved',
  /** 已驳回 */
  REJECTED: 'rejected',
} as const;

export type TenantCertificationStatus = EnumValue<typeof TenantCertificationStatusEnum>;

/**
 * 租户续费收款方式
 */
export const TenantRenewPaymentMethodEnum = {
  /** 银行转账 */
  BANK_TRANSFER: 'bank_transfer',
  /** 微信支付 */
  WECHAT_PAY: 'wechat_pay',
  /** 支付宝 */
  ALIPAY: 'alipay',
  /** 线下打款 */
  OFFLINE_REMITTANCE: 'offline_remittance',
} as const;

export type TenantRenewPaymentMethod = EnumValue<typeof TenantRenewPaymentMethodEnum>;

/**
 * 租户收单配置状态
 */
export const TenantPaymentConfigStatusEnum = {
  /** 尚未配置 */
  NOT_CONFIGURED: 'not_configured',
  /** 已保存待校验 */
  PENDING_VALIDATION: 'pending_validation',
  /** 校验通过可用 */
  AVAILABLE: 'available',
  /** 人为停用 */
  DISABLED: 'disabled',
  /** 校验失败或外部不可用 */
  INVALID: 'invalid',
} as const;

export type TenantPaymentConfigStatus = EnumValue<typeof TenantPaymentConfigStatusEnum>;
