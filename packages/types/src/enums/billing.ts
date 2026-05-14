import type { EnumValue } from './common';

/**
 * 套餐状态
 */
export const BillingPackageStatusEnum = {
  /** 已生效 */
  ACTIVE: 'active',
  /** 草稿 */
  DRAFT: 'draft',
  /** 已归档 */
  ARCHIVED: 'archived',
} as const;

export type BillingPackageStatus = EnumValue<typeof BillingPackageStatusEnum>;

/**
 * 合同类型
 */
export const ContractTypeEnum = {
  /** 电子签合同 */
  ELECTRONIC_SIGNATURE: 'electronic_signature',
  /** 归档件合同 */
  ARCHIVE_COPY: 'archive_copy',
} as const;

export type ContractType = EnumValue<typeof ContractTypeEnum>;

/**
 * 合同状态
 */
export const ContractStatusEnum = {
  /** 履约中 */
  ACTIVE: 'active',
  /** 待续约 */
  PENDING_RENEWAL: 'pending_renewal',
  /** 待签署 */
  PENDING_SIGNING: 'pending_signing',
  /** 待归档 */
  PENDING_ARCHIVE: 'pending_archive',
  /** 已终止 */
  TERMINATED: 'terminated',
} as const;

export type ContractStatus = EnumValue<typeof ContractStatusEnum>;

/**
 * 发票状态
 */
export const InvoiceStatusEnum = {
  /** 已开票 */
  ISSUED: 'issued',
  /** 待开票 */
  PENDING_ISSUE: 'pending_issue',
  /** 对账中 */
  RECONCILING: 'reconciling',
  /** 已作废 */
  VOIDED: 'voided',
} as const;

export type InvoiceStatus = EnumValue<typeof InvoiceStatusEnum>;
