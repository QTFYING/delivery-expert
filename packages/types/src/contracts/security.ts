import type { ListParams } from '../common';
import type { AuditResult, AuditTargetType, TenantSide } from '../enums';

export interface PlatformRoleTemplateItem {
  /** 角色 ID */
  id: string;
  /** 角色名称 */
  name: string;
  /** 所属侧别 */
  side: TenantSide;
  /** 权限编码列表 */
  permissions: string[];
}

export interface CreatePlatformRoleTemplateRequest {
  /** 角色名称 */
  name: string;
  /** 所属侧别 */
  side: TenantSide;
  /** 权限编码列表 */
  permissions: string[];
}

export interface UpdatePlatformRoleTemplateRequest {
  /** 角色名称 */
  name?: string;
  /** 所属侧别 */
  side?: TenantSide;
  /** 权限编码列表 */
  permissions?: string[];
}

export interface AuditLogListQuery extends ListParams {
  /** 开始日期 */
  dateFrom?: string;
  /** 结束日期 */
  dateTo?: string;
}

export interface PlatformAuditRecordItem {
  /** 日志 ID */
  id: string;
  /** 操作名称 */
  action: string;
  /** 操作人 */
  actor: string;
  /** 操作对象 */
  target: string;
  /** 目标类型 */
  targetType: AuditTargetType;
  /** 所属租户 */
  tenant: string;
  /** 操作时间 */
  time: string;
  /** 操作结果 */
  result: AuditResult;
}

export interface SecurityPolicyItem {
  /** 策略 ID */
  id: string;
  /** 策略标题 */
  title: string;
  /** 策略说明 */
  detail: string;
  /** 是否启用 */
  enabled: boolean;
}

export interface UpdateSecurityPolicyRequest {
  /** 是否启用 */
  enabled: boolean;
}

export interface IpWhitelistItem {
  /** 白名单 ID */
  id: string;
  /** 白名单名称 */
  label: string;
  /** CIDR 网段 */
  cidr: string;
}

export interface CreateIpWhitelistRequest {
  /** 白名单名称 */
  label: string;
  /** CIDR 网段 */
  cidr: string;
}

export interface UpdateIpWhitelistRequest {
  /** 白名单名称 */
  label?: string;
  /** CIDR 网段 */
  cidr?: string;
}

export interface SecurityPeriodPolicy {
  /** 会话有效时长 单位小时 */
  sessionHours: number;
  /** 密码过期周期 单位天 */
  passwordDays: number;
  /** 审计日志保留天数 */
  retentionDays: number;
}
