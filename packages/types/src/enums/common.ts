/** 从运行时枚举对象中提取稳定取值联合类型 */
export type EnumValue<T extends Record<string, string | number>> = T[keyof T];

/**
 * 列表排序方向
 */
export const SortOrderEnum = {
  /** 升序 */
  ASC: 'asc',
  /** 降序 */
  DESC: 'desc',
} as const;

export type SortOrder = EnumValue<typeof SortOrderEnum>;

/**
 * 用户所属侧
 */
export const TenantSideEnum = {
  /** 平台侧用户 */
  PLATFORM: 'platform',
  /** 租户侧用户 */
  TENANT: 'tenant',
} as const;

export type TenantSide = EnumValue<typeof TenantSideEnum>;

/**
 * 登录态来源标记
 */
export const AuthSourceTagEnum = {
  /** 模拟数据 */
  MOCK: 'mock',
  /** 远端真实数据 */
  REMOTE: 'remote',
} as const;

export type AuthSourceTag = EnumValue<typeof AuthSourceTagEnum>;

/**
 * 审核动作
 */
export const ReviewActionEnum = {
  /** 审核通过 */
  APPROVE: 'approve',
  /** 审核驳回 */
  REJECT: 'reject',
} as const;

export type ReviewAction = EnumValue<typeof ReviewActionEnum>;

/**
 * 冻结动作
 */
export const FreezeActionEnum = {
  /** 冻结 */
  FREEZE: 'freeze',
  /** 解冻 */
  UNFREEZE: 'unfreeze',
} as const;

export type FreezeAction = EnumValue<typeof FreezeActionEnum>;

/**
 * 租户员工精简状态
 */
export const UserSimpleStatusEnum = {
  /** 启用 */
  ACTIVE: 'active',
  /** 禁用 */
  DISABLED: 'disabled',
} as const;

export type UserSimpleStatus = EnumValue<typeof UserSimpleStatusEnum>;

/**
 * 公告发布时间类型
 */
export const PublishTimingEnum = {
  /** 立即发布 */
  IMMEDIATE: 'immediate',
  /** 定时发布 */
  SCHEDULED: 'scheduled',
} as const;

export type PublishTiming = EnumValue<typeof PublishTimingEnum>;

/**
 * 审计对象类型
 */
export const AuditTargetTypeEnum = {
  /** 账号 */
  ACCOUNT: 'account',
  /** 角色 */
  ROLE: 'role',
  /** 租户 */
  TENANT: 'tenant',
} as const;

export type AuditTargetType = EnumValue<typeof AuditTargetTypeEnum>;

/**
 * 审计执行结果
 */
export const AuditResultEnum = {
  /** 执行成功 */
  SUCCESS: 'success',
  /** 待进一步处理 */
  PENDING: 'pending',
} as const;

export type AuditResult = EnumValue<typeof AuditResultEnum>;
