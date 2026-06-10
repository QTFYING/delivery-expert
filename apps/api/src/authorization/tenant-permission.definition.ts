import {
  TenantPermissionCodeEnum,
  TenantPermissionDomainEnum,
  TenantRoleEnum,
  type TenantPermissionCode,
  type TenantPermissionDomain,
  type TenantRole,
} from '@shou/types/enums';

export const TENANT_PERMISSION_TREE_VERSION = 'v2026.06.08';

export interface TenantPermissionDefinition {
  code: TenantPermissionCode;
  description: string;
}

export interface TenantPermissionDomainDefinition {
  domain: TenantPermissionDomain;
  description: string;
  permissions: readonly TenantPermissionDefinition[];
}

export const TENANT_PERMISSION_DEFINITIONS = [
  {
    domain: TenantPermissionDomainEnum.ANALYTICS,
    description: '数据分析域',
    permissions: [{ code: TenantPermissionCodeEnum.ANALYTICS_READ, description: '查看经营统计' }],
  },
  {
    domain: TenantPermissionDomainEnum.ORDERS,
    description: '订单域',
    permissions: [
      { code: TenantPermissionCodeEnum.ORDERS_READ, description: '查看订单' },
      { code: TenantPermissionCodeEnum.ORDERS_MANAGE, description: '订单管理' },
      { code: TenantPermissionCodeEnum.ORDERS_IMPORT_MANAGE, description: '订单导入' },
      { code: TenantPermissionCodeEnum.ORDERS_PRINT_MANAGE, description: '打印中心' },
      { code: TenantPermissionCodeEnum.ORDERS_REMINDER_CREATE, description: '创建催款提醒' },
    ],
  },
  {
    domain: TenantPermissionDomainEnum.TEMPLATES,
    description: '映射模板域',
    permissions: [
      { code: TenantPermissionCodeEnum.TEMPLATES_READ, description: '查看映射模板' },
      { code: TenantPermissionCodeEnum.TEMPLATES_MANAGE, description: '管理映射模板' },
    ],
  },
  {
    domain: TenantPermissionDomainEnum.CREDIT,
    description: '账期域',
    permissions: [{ code: TenantPermissionCodeEnum.CREDIT_RECEIPT_CREATE, description: '创建内部收款记录' }],
  },
  {
    domain: TenantPermissionDomainEnum.PAYMENTS,
    description: '收款域',
    permissions: [
      { code: TenantPermissionCodeEnum.PAYMENTS_READ, description: '查看收款流水' },
      { code: TenantPermissionCodeEnum.PAYMENTS_OFFLINE_PAYMENT_VERIFY_CREATE, description: '确认线下登记支付' },
    ],
  },
  {
    domain: TenantPermissionDomainEnum.FINANCE,
    description: '财务域',
    permissions: [
      { code: TenantPermissionCodeEnum.FINANCE_READ, description: '查看财务数据' },
      { code: TenantPermissionCodeEnum.FINANCE_EXPORT, description: '导出财务数据' },
    ],
  },
  {
    domain: TenantPermissionDomainEnum.PRINTING,
    description: '打印域',
    permissions: [
      { code: TenantPermissionCodeEnum.PRINTING_CONFIG_READ, description: '查看打印配置' },
      { code: TenantPermissionCodeEnum.PRINTING_CONFIG_UPDATE, description: '更新打印配置' },
    ],
  },
  {
    domain: TenantPermissionDomainEnum.SETTINGS,
    description: '设置域',
    permissions: [
      { code: TenantPermissionCodeEnum.SETTINGS_GENERAL_MANAGE, description: '管理通用设置' },
      { code: TenantPermissionCodeEnum.SETTINGS_USERS_MANAGE, description: '管理用户' },
      { code: TenantPermissionCodeEnum.SETTINGS_ROLES_MANAGE, description: '管理角色和权限' },
      { code: TenantPermissionCodeEnum.SETTINGS_AUDIT_LOGS_READ, description: '查看操作日志' },
      { code: TenantPermissionCodeEnum.SETTINGS_PAYMENT_CONFIGS_READ, description: '查看支付渠道配置' },
      { code: TenantPermissionCodeEnum.SETTINGS_PAYMENT_CONFIGS_MANAGE, description: '管理支付渠道配置' },
    ],
  },
  {
    domain: TenantPermissionDomainEnum.TENANT,
    description: '租户主体域',
    permissions: [
      { code: TenantPermissionCodeEnum.TENANT_PROFILE_READ, description: '查看当前租户主体资料' },
      { code: TenantPermissionCodeEnum.TENANT_CERTIFICATION_MANAGE, description: '管理资质认证' },
    ],
  },
  {
    domain: TenantPermissionDomainEnum.NOTIFICATIONS,
    description: '通知域',
    permissions: [
      { code: TenantPermissionCodeEnum.NOTIFICATIONS_READ, description: '查看通知' },
      { code: TenantPermissionCodeEnum.NOTIFICATIONS_MANAGE, description: '管理通知阅读状态' },
    ],
  },
] as const satisfies readonly TenantPermissionDomainDefinition[];

export const ALL_TENANT_PERMISSION_CODES = TENANT_PERMISSION_DEFINITIONS.flatMap((domain) =>
  domain.permissions.map((permission) => permission.code),
) as TenantPermissionCode[];

export const DEFAULT_TENANT_ROLE_PERMISSIONS = {
  [TenantRoleEnum.OWNER]: ALL_TENANT_PERMISSION_CODES,
  [TenantRoleEnum.FINANCE]: [
    TenantPermissionCodeEnum.ANALYTICS_READ,
    TenantPermissionCodeEnum.ORDERS_READ,
    TenantPermissionCodeEnum.ORDERS_REMINDER_CREATE,
    TenantPermissionCodeEnum.TEMPLATES_READ,
    TenantPermissionCodeEnum.CREDIT_RECEIPT_CREATE,
    TenantPermissionCodeEnum.PAYMENTS_READ,
    TenantPermissionCodeEnum.PAYMENTS_OFFLINE_PAYMENT_VERIFY_CREATE,
    TenantPermissionCodeEnum.FINANCE_READ,
    TenantPermissionCodeEnum.FINANCE_EXPORT,
    TenantPermissionCodeEnum.SETTINGS_PAYMENT_CONFIGS_READ,
    TenantPermissionCodeEnum.TENANT_PROFILE_READ,
    TenantPermissionCodeEnum.NOTIFICATIONS_READ,
    TenantPermissionCodeEnum.NOTIFICATIONS_MANAGE,
  ],
  [TenantRoleEnum.OPERATOR]: [
    TenantPermissionCodeEnum.ORDERS_READ,
    TenantPermissionCodeEnum.ORDERS_MANAGE,
    TenantPermissionCodeEnum.ORDERS_IMPORT_MANAGE,
    TenantPermissionCodeEnum.ORDERS_PRINT_MANAGE,
    TenantPermissionCodeEnum.TEMPLATES_READ,
    TenantPermissionCodeEnum.PRINTING_CONFIG_READ,
    TenantPermissionCodeEnum.TENANT_PROFILE_READ,
    TenantPermissionCodeEnum.NOTIFICATIONS_READ,
    TenantPermissionCodeEnum.NOTIFICATIONS_MANAGE,
  ],
  [TenantRoleEnum.VIEWER]: [
    TenantPermissionCodeEnum.ANALYTICS_READ,
    TenantPermissionCodeEnum.ORDERS_READ,
    TenantPermissionCodeEnum.TEMPLATES_READ,
    TenantPermissionCodeEnum.TENANT_PROFILE_READ,
    TenantPermissionCodeEnum.NOTIFICATIONS_READ,
  ],
} as const satisfies Record<TenantRole, readonly TenantPermissionCode[]>;

const TENANT_PERMISSION_CODE_SET = new Set<TenantPermissionCode>(ALL_TENANT_PERMISSION_CODES);

export function isTenantPermissionCode(value: string): value is TenantPermissionCode {
  return TENANT_PERMISSION_CODE_SET.has(value as TenantPermissionCode);
}

export function assertTenantPermissionCodes(values: readonly string[]): TenantPermissionCode[] {
  const invalidCodes = values.filter((value) => !isTenantPermissionCode(value));
  if (invalidCodes.length > 0) {
    throw new Error(`Invalid tenant permission codes: ${invalidCodes.join(', ')}`);
  }

  return [...new Set(values)] as TenantPermissionCode[];
}
