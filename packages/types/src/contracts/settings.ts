import type { ListParams, PaginatedResponse } from '../common';
import type {
  PaymentChannel,
  PrinterTemplateSource,
  TenantPaymentConfigStatus,
  TenantPermissionCode,
  TenantPermissionDomain,
  TenantStatus,
  UserSimpleStatus,
} from '../enums';

export interface TenantPermissionItem {
  /** 权限编码 */
  code: TenantPermissionCode;
  /** 服务端业务能力说明，不代表前端菜单文案 */
  description: string;
}

export interface TenantPermissionDomainNode {
  /** 权限所属业务域 */
  domain: TenantPermissionDomain;
  /** 服务端业务域说明，不代表前端菜单文案 */
  description: string;
  /** 当前业务域下的权限项 */
  permissions: TenantPermissionItem[];
}

export interface TenantPermissionTreeResponse {
  /** 权限能力树版本，随服务端权限定义发布 */
  version: string;
  /** 按业务域分组的权限能力列表 */
  domains: TenantPermissionDomainNode[];
}

export interface TenantRoleAccount {
  /** 角色 ID */
  id: string;
  /** 角色编码；内置角色使用 TENANT_*，自定义角色由服务端生成 */
  code: string;
  /** 角色名称 */
  name: string;
  /** 角色描述 */
  description?: string;
  /** 权限编码列表 */
  permissions: TenantPermissionCode[];
  /** 是否系统内置角色 */
  isSystem: boolean;
  /** 是否允许编辑 */
  isEditable: boolean;
  /** 使用该角色的用户数 */
  userCount: number;
  /** 创建时间 */
  createdAt?: string;
  /** 更新时间 */
  updatedAt?: string;
}

export interface CreateTenantRoleRequest {
  /** 角色名称 */
  name: string;
  /** 角色描述 */
  description?: string;
  /** 角色包含的权限编码 */
  permissionCodes: TenantPermissionCode[];
}

export interface UpdateTenantRoleRequest {
  /** 角色名称 */
  name?: string;
  /** 角色描述 */
  description?: string;
  /** 角色包含的权限编码 */
  permissionCodes?: TenantPermissionCode[];
}

export interface TenantSettingsUser {
  /** 用户 ID */
  id: string;
  /** 用户姓名 */
  name: string;
  /** 当前角色 ID */
  roleId: string;
  /** 当前角色编码 */
  roleCode: string;
  /** 当前角色名称 */
  roleName: string;
  /** 手机号 */
  phone: string;
  /** 用户状态 */
  status: UserSimpleStatus;
  /** 最近登录时间 */
  lastLogin: string;
}

export interface CreateTenantUserRequest {
  /** 用户姓名 */
  name: string;
  /** 手机号 */
  phone: string;
  /** 登录账号；未提交时服务端使用手机号 */
  account?: string;
  /** 角色 ID */
  roleId: string;
}

export interface UpdateTenantUserRequest {
  /** 用户姓名 */
  name?: string;
  /** 登录账号；未提交时服务端使用手机号 */
  account?: string;
  /** 角色 ID */
  roleId?: string;
  /** 手机号 */
  phone?: string;
  /** 用户状态 */
  status?: UserSimpleStatus;
}

export interface TenantUserStatusUpdateRequest {
  /** 更新后的用户状态 */
  status: UserSimpleStatus;
}

export interface TenantGeneralSettings {
  /** 订单可支付有效期（单位：天） */
  qrCodeExpiry: number;
  /** 是否通知业务员 */
  notifySeller: boolean;
  /** 是否通知老板 */
  notifyOwner: boolean;
  /** 是否通知财务 */
  notifyFinance: boolean;
  /** 账期提醒提前天数 */
  creditRemindDays: number;
  /** 是否推送日报 */
  dailyReportPush: boolean;
}

export interface UpdateTenantGeneralSettingsRequest {
  /** 订单可支付有效期（单位：天） */
  qrCodeExpiry?: number;
  /** 是否通知业务员 */
  notifySeller?: boolean;
  /** 是否通知老板 */
  notifyOwner?: boolean;
  /** 是否通知财务 */
  notifyFinance?: boolean;
  /** 账期提醒提前天数 */
  creditRemindDays?: number;
  /** 是否推送日报 */
  dailyReportPush?: boolean;
}

export interface TenantPaymentConfigSnapshot {
  /** 支付通道 */
  channel: PaymentChannel;
  /** 所属租户 ID */
  tenantId: string;
  /** 所属租户名称；Tenant 侧可不返回 */
  tenantName?: string | null;
  /** 配置状态 */
  status: TenantPaymentConfigStatus;
  /** 是否为当前生效支付渠道 */
  isCurrentActive?: boolean;
  /** 配置无效原因 */
  invalidReason: string | null;
  /** 最近一次校验时间 */
  lastValidatedAt: string | null;
  /** 最近更新时间 */
  updatedAt: string | null;
  /** 最近更新人 */
  updatedBy: string | null;
  /** 渠道专属配置；未配置时为 null */
  config: Record<string, unknown> | null;
}

export interface TenantPaymentConfigListItem {
  /** 支付通道 */
  channel: PaymentChannel;
  /** 所属租户 ID */
  tenantId: string;
  /** 所属租户名称 */
  tenantName: string;
  /** 配置状态 */
  status: TenantPaymentConfigStatus;
  /** 配置无效原因 */
  invalidReason: string | null;
  /** 最近一次校验时间 */
  lastValidatedAt: string | null;
  /** 最近更新时间 */
  updatedAt: string | null;
  /** 最近更新人 */
  updatedBy: string | null;
  /** 租户状态 */
  tenantStatus: TenantStatus;
}

export interface GetTenantPaymentConfigListResponse {
  /** 当前生效支付渠道 */
  activePaymentChannel: PaymentChannel | null;
  /** 支付渠道配置摘要列表 */
  items: TenantPaymentConfigListItem[];
}

export interface UpsertTenantPaymentConfigRequest {
  /** 渠道专属配置 */
  config: Record<string, unknown>;
}

export interface PrintingConfigListItem {
  /** 导入模板 ID */
  importTemplateId: string;
  /** 导入模板名称 */
  importTemplateName: string;
  /** 是否存在租户自定义打印配置 */
  hasCustomConfig: boolean;
  /** 打印配置来源；未配置时省略 */
  source?: PrinterTemplateSource;
  /** 配置版本号 */
  configVersion?: number;
  /** 最近更新时间 */
  updatedAt?: string;
  /** 最近更新人 */
  updatedBy?: string;
  /** 备注 */
  remark?: string;
}

export interface GetPrintingConfigListResponse {
  /** 打印配置列表 */
  items: PrintingConfigListItem[];
}

export interface GetPrintingConfigDetailResponse {
  /** 导入模板 ID */
  importTemplateId: string;
  /** 导入模板名称 */
  importTemplateName?: string;
  /** 是否存在租户自定义打印配置 */
  hasCustomConfig: boolean;
  /** 打印配置来源；未配置时省略 */
  source?: PrinterTemplateSource;
  /** 配置版本号 */
  configVersion?: number;
  /** 打印配置黑盒 JSON */
  config?: Record<string, unknown>;
  /** 最近更新时间 */
  updatedAt?: string;
  /** 最近更新人 */
  updatedBy?: string;
  /** 备注 */
  remark?: string;
}

export interface UpdatePrintingConfigRequest {
  /** 期望更新的配置版本号 */
  configVersion?: number;
  /** 打印配置黑盒 JSON */
  config: Record<string, unknown>;
  /** 备注 */
  remark?: string;
}

export interface UpdatePrintingConfigResponse {
  /** 导入模板 ID */
  importTemplateId: string;
  /** 是否存在租户自定义打印配置 */
  hasCustomConfig: boolean;
  /** 最新配置版本号 */
  configVersion: number;
  /** 更新时间 */
  updatedAt: string;
  /** 更新人 */
  updatedBy?: string;
  /** 备注 */
  remark?: string;
}

export interface TenantAuditLogQuery {
  /** 页码 */
  page: number;
  /** 每页条数 */
  pageSize: number;
  /** 起始日期 */
  startDate?: string;
  /** 结束日期 */
  endDate?: string;
  /** 操作人筛选 */
  operator?: string;
}

export interface AuditLogRecord {
  /** 日志 ID */
  id: string;
  /** 操作描述 */
  action: string;
  /** 操作人 */
  operator: string;
  /** 操作 IP */
  ip: string;
  /** 操作时间 */
  createdAt: string;
}

export type TenantAuditLogListResponse = PaginatedResponse<AuditLogRecord>;

export interface TenantNotificationRecordItem {
  /** 通知 ID */
  id: string;
  /** 通知标题 */
  title: string;
  /** 通知内容 */
  content: string;
  /** 发布时间 */
  publishAt: string;
  /** 是否已读 */
  isRead: boolean;
}

export type TenantNotificationListQuery = ListParams;
