import type { EnumValue } from './common';

/**
 * 官方打印模板包状态
 */
export const PrintingTemplatePackageStatusEnum = {
  /** 草稿，仅平台侧可见 */
  DRAFT: 'draft',
  /** 已发布，租户可见可复制 */
  PUBLISHED: 'published',
  /** 已下线，租户不可继续复制 */
  OFFLINE: 'offline',
} as const;

export type PrintingTemplatePackageStatus = EnumValue<typeof PrintingTemplatePackageStatusEnum>;

/**
 * 租户打印配置来源
 */
export const PrinterTemplateSourceEnum = {
  /** 租户自定义打印配置 */
  CUSTOM: 'custom',
  /** 由官方打印模板包复制生成 */
  OFFICIAL_PACKAGE: 'official_package',
} as const;

export type PrinterTemplateSource = EnumValue<typeof PrinterTemplateSourceEnum>;
