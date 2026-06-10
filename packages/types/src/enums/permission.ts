import type { EnumValue } from './common';

/**
 * Tenant 权限业务域
 */
export const TenantPermissionDomainEnum = {
  /** 数据分析 */
  ANALYTICS: 'analytics',
  /** 订单 */
  ORDERS: 'orders',
  /** 映射模板 */
  TEMPLATES: 'templates',
  /** 账期 */
  CREDIT: 'credit',
  /** 收款 */
  PAYMENTS: 'payments',
  /** 财务 */
  FINANCE: 'finance',
  /** 打印 */
  PRINTING: 'printing',
  /** 设置 */
  SETTINGS: 'settings',
  /** 租户主体 */
  TENANT: 'tenant',
  /** 通知 */
  NOTIFICATIONS: 'notifications',
} as const;

export type TenantPermissionDomain = EnumValue<typeof TenantPermissionDomainEnum>;

/**
 * Tenant 功能权限编码
 */
export const TenantPermissionCodeEnum = {
  /** 查看经营统计 */
  ANALYTICS_READ: 'analytics.read',

  /** 查看订单 */
  ORDERS_READ: 'orders.read',
  /** 管理订单：创建、编辑和作废订单 （业务暂不支持手动创单、编辑订单） */
  ORDERS_MANAGE: 'orders.manage',
  /** 管理订单导入 */
  ORDERS_IMPORT_MANAGE: 'orders.import.manage',

  /** 打印中心 */
  ORDERS_PRINT_MANAGE: 'orders.print.manage',
  /** 创建催款提醒 */
  ORDERS_REMINDER_CREATE: 'orders.reminder.create',

  /** 查看映射模板 */
  TEMPLATES_READ: 'templates.read',
  /** 管理映射模板 */
  TEMPLATES_MANAGE: 'templates.manage',

  /** 创建内部收款记录 */
  CREDIT_RECEIPT_CREATE: 'credit.receipt.create',

  /** 查看收款流水 */
  PAYMENTS_READ: 'payments.read',
  /** 确认线下登记支付 */
  PAYMENTS_OFFLINE_PAYMENT_VERIFY_CREATE: 'payments.offline_payment_verify.create',

  /** 查看财务数据 */
  FINANCE_READ: 'finance.read',
  /** 导出财务数据 */
  FINANCE_EXPORT: 'finance.export',

  /** 查看打印配置 */
  PRINTING_CONFIG_READ: 'printing.config.read',
  /** 更新打印配置 */
  PRINTING_CONFIG_UPDATE: 'printing.config.update',

  /** 管理通用设置 */
  SETTINGS_GENERAL_MANAGE: 'settings.general.manage',
  /** 管理用户 */
  SETTINGS_USERS_MANAGE: 'settings.users.manage',
  /** 管理角色和权限 */
  SETTINGS_ROLES_MANAGE: 'settings.roles.manage',
  /** 查看操作日志 */
  SETTINGS_AUDIT_LOGS_READ: 'settings.audit_logs.read',
  /** 查看支付渠道配置 */
  SETTINGS_PAYMENT_CONFIGS_READ: 'settings.payment_configs.read',
  /** 管理支付渠道配置 */
  SETTINGS_PAYMENT_CONFIGS_MANAGE: 'settings.payment_configs.manage',

  /** 查看当前租户主体资料 */
  TENANT_PROFILE_READ: 'tenant.profile.read',
  /** 管理资质认证 */
  TENANT_CERTIFICATION_MANAGE: 'tenant.certification.manage',

  /** 查看通知 */
  NOTIFICATIONS_READ: 'notifications.read',
  /** 管理通知阅读状态 */
  NOTIFICATIONS_MANAGE: 'notifications.manage',
} as const;

export type TenantPermissionCode = EnumValue<typeof TenantPermissionCodeEnum>;
