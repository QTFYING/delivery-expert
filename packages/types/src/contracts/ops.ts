import type { NoticeStatus, PublishTiming, ServiceProviderStatus, TicketStatus } from '../enums';

export interface AlertRuleItem {
  /** 规则 ID */
  id: string;
  /** 规则名称 */
  name: string;
  /** 触发条件 */
  trigger: string;
  /** 通知渠道 */
  channel: string;
  /** 是否启用 */
  enabled: boolean;
}

export interface CreateAlertRuleRequest {
  /** 规则名称 */
  name: string;
  /** 触发条件 */
  trigger: string;
  /** 通知渠道 */
  channel: string;
}

export interface UpdateAlertRuleRequest {
  /** 规则名称 */
  name?: string;
  /** 触发条件 */
  trigger?: string;
  /** 通知渠道 */
  channel?: string;
}

export interface PatchAlertRuleStatusRequest {
  /** 是否启用 */
  enabled: boolean;
}

export interface SystemConfigItem {
  /** 配置分组 */
  group: string;
  /** 配置键 */
  key: string;
  /** 配置值 */
  value: string;
  /** 配置说明 */
  note: string;
}

export interface ServiceConfigItem {
  /** 配置 ID */
  id: string;
  /** 配置名称 */
  name: string;
  /** 配置分类 */
  category: string;
  /** 配置键 */
  key: string;
  /** 服务提供方 */
  provider: string;
  /** 配置说明 */
  note: string;
}

export interface CreateServiceConfigRequest {
  /** 配置名称 */
  name: string;
  /** 配置分类 */
  category: string;
  /** 配置键 */
  key: string;
  /** 服务提供方 */
  provider: string;
  /** 配置说明 */
  note: string;
}

export interface UpdateServiceConfigRequest {
  /** 配置名称 */
  name?: string;
  /** 配置分类 */
  category?: string;
  /** 配置键 */
  key?: string;
  /** 服务提供方 */
  provider?: string;
  /** 配置说明 */
  note?: string;
}

export interface NoticeRecordItem {
  /** 公告 ID */
  id: string;
  /** 公告标题 */
  title: string;
  /** 目标受众 */
  audience: string;
  /** 公告状态 */
  status: NoticeStatus;
  /** 发布时间 */
  publishAt: string;
  /** 公告内容 */
  content?: string;
  /** 方案版本 */
  planVersion?: string;
  /** 发布时机 */
  timing?: PublishTiming;
  /** 预约发布时间 */
  scheduledAt?: string;
  /** 是否发送提醒 */
  reminder?: boolean;
  /** 是否草稿 */
  isDraft?: boolean;
}

export interface NoticeUpsertRequest {
  /** 公告标题 */
  title: string;
  /** 公告内容 */
  content: string;
  /** 方案版本 */
  planVersion: string;
  /** 目标受众 */
  audience: string;
  /** 发布时机 */
  timing: PublishTiming;
  /** 预约发布时间 */
  scheduledAt?: string;
  /** 是否发送提醒 */
  reminder: boolean;
  /** 是否草稿 */
  isDraft: boolean;
}

export interface TicketRecordItem {
  /** 工单编号 */
  no: string;
  /** 所属租户 */
  tenant: string;
  /** 问题摘要 */
  issue: string;
  /** 当前处理人 */
  assignee: string;
  /** 工单状态 */
  status: TicketStatus;
}

export interface TicketReplyResult {
  /** 回复 ID */
  replyId: string;
  /** 回复内容 */
  content: string;
  /** 回复人 */
  repliedBy: string;
  /** 回复时间 */
  repliedAt: string;
}

export interface CreateTicketReplyRequest {
  /** 回复内容 */
  content: string;
  /** 附件列表 */
  attachments?: string[];
}

export interface CreateTicketAssignmentRequest {
  /** 指派对象 */
  assignee: string;
}

export interface TicketAssignmentResponse {
  /** 工单编号 */
  no: string;
  /** 指派后的处理人 */
  assignee: string;
  /** 工单状态 */
  status: TicketStatus;
  /** 指派时间 */
  assignedAt: string;
}

export interface CreateTicketClosureRequest {
  /** 关闭说明 */
  resolution?: string;
}

export interface TicketClosureResponse {
  /** 工单编号 */
  no: string;
  /** 工单状态 */
  status: TicketStatus;
  /** 关闭说明 */
  resolution?: string;
  /** 关闭时间 */
  closedAt: string;
}

export interface ServiceProviderRecordItem {
  /** 服务商 ID */
  id: string;
  /** 服务商名称 */
  name: string;
  /** 服务商分类 */
  category: string;
  /** 联系人 */
  contactName: string;
  /** 联系电话 */
  contactPhone: string;
  /** 服务商状态 */
  status: ServiceProviderStatus;
  /** 评分 */
  score: string;
}

export interface CreateServiceProviderRequest {
  /** 服务商名称 */
  name: string;
  /** 服务商分类 */
  category: string;
  /** 联系人 */
  contactName: string;
  /** 联系电话 */
  contactPhone: string;
  /** 服务商状态 */
  status?: ServiceProviderStatus;
}

export interface UpdateServiceProviderRequest {
  /** 服务商名称 */
  name?: string;
  /** 服务商分类 */
  category?: string;
  /** 联系人 */
  contactName?: string;
  /** 联系电话 */
  contactPhone?: string;
  /** 服务商状态 */
  status?: ServiceProviderStatus;
}
