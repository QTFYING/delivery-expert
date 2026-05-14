import type { EnumValue } from './common';

/**
 * 公告状态
 */
export const NoticeStatusEnum = {
  /** 已发布 */
  PUBLISHED: 'published',
  /** 草稿 */
  DRAFT: 'draft',
  /** 已下架 */
  OFFLINE: 'offline',
} as const;

export type NoticeStatus = EnumValue<typeof NoticeStatusEnum>;

/**
 * 工单状态
 */
export const TicketStatusEnum = {
  /** 待分派 */
  PENDING: 'pending',
  /** 处理中 */
  PROCESSING: 'processing',
  /** 已解决 */
  RESOLVED: 'resolved',
} as const;

export type TicketStatus = EnumValue<typeof TicketStatusEnum>;

/**
 * 服务商接入状态
 */
export const ServiceProviderStatusEnum = {
  /** 已接入 */
  ACTIVE: 'active',
  /** 试运行 */
  TRIAL: 'trial',
} as const;

export type ServiceProviderStatus = EnumValue<typeof ServiceProviderStatusEnum>;
