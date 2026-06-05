import type { ListParams } from '../common';
import type {
  AuditResult,
  AuditTargetType,
  PaymentChannel,
  ReviewAction,
  SortOrder,
  TenantCertificationStatus,
  TenantRenewPaymentMethod,
  TenantSide,
  TenantSoftwareVersion,
  TenantSortField,
  TenantStatus,
  UserStatus,
} from '../enums';

export interface TenantRecordItem {
  /** 租户 ID */
  id: string;
  /** 租户名称 */
  name: string;
  /** 根据软件版本级别派生的软件展示名称 */
  softwareName: string;
  /** 租户采购的软件版本级别 */
  softwareVersion: TenantSoftwareVersion;
  /** 老板姓名 */
  ownerName: string;
  /** 老板登录账号，当前按手机号使用 */
  ownerAccount: string | null;
  /** 联系地址 */
  address: string;
  /** 统一社会信用代码 */
  licenseNo: string;
  /** 账号数 */
  users: number;
  /** 当前生效支付渠道 */
  activePaymentChannel: PaymentChannel | null;
  /** 本月流水 单位元 */
  monthlyFlow: number;
  /** 租户采购服务到期时间，作为到期事实字段 */
  serviceExpireAt: string | null;
  /** 由 serviceExpireAt 派生的距到期天数；未配置服务到期时间时返回 null */
  dueInDays: number | null;
  /** 最近活跃时间 */
  lastActiveAt: string;
  /** 租户状态 */
  status: TenantStatus;
  /** 驳回原因 */
  rejectReason?: string | null;
  /** 冻结原因 */
  freezeReason?: string | null;
}

export interface TenantProfile {
  /** 租户 ID */
  id: string;
  /** 租户名称 */
  name: string;
  /** 根据软件版本级别派生的软件展示名称 */
  softwareName: string;
  /** 租户采购的软件版本级别 */
  softwareVersion: TenantSoftwareVersion;
  /** 联系地址 */
  address: string;
  /** 统一社会信用代码 */
  licenseNo: string;
  /** 联系电话 */
  contactPhone: string;
  /** 老板姓名 */
  ownerName: string | null;
  /** 租户状态 */
  status: TenantStatus;
  /** 驳回原因 */
  rejectReason: string | null;
  /** 冻结原因 */
  freezeReason: string | null;
  /** 租户采购服务到期时间，Tenant 侧只读返回 */
  serviceExpireAt: string | null;
  /** 最大账期天数 */
  maxCreditDays: number;
  /** 账期提醒提前天数 */
  creditRemindDays: number;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

export interface UserRecordItem {
  /** 用户 ID */
  id: string;
  /** 登录账号 */
  account: string;
  /** 用户姓名 */
  name: string;
  /** 所属租户名称 */
  tenant: string;
  /** 所属侧别 */
  tenantType: TenantSide;
  /** 角色名称 */
  role: string;
  /** 权限范围 */
  scope: string;
  /** 手机号 */
  phone: string;
  /** 用户状态 */
  status: UserStatus;
  /** 最近登录时间 */
  loginAt: string;
  /** 是否要求首次重置密码 */
  requiresPasswordReset: boolean;
}

export interface UserListQuery extends ListParams {
  /** 租户筛选 */
  tenant?: string;
  /** 角色筛选 */
  role?: string;
}

export interface UserUpsertRequest {
  /** 用户姓名 */
  name: string;
  /** 登录账号 */
  account: string;
  /** 手机号 */
  phone: string;
  /** 所属侧别 */
  tenantType: TenantSide;
  /** 所属租户 */
  tenant: string;
  /** 角色名称 */
  role: string;
  /** 权限范围 */
  scope: string;
  /** 用户状态 */
  status: UserStatus;
}

export interface UserStatusUpdateRequest {
  /** 更新后的用户状态 */
  status: UserStatus;
}

export interface CreateUserPasswordResetRequest {
  /** 重置后的密码 不传则由服务端生成 */
  password?: string;
}

export interface CreateUserPasswordResetResponse {
  /** 是否要求下次登录重置密码 */
  requiresPasswordReset: true;
}

export interface AuditRecordItem {
  /** 日志 ID */
  id: string;
  /** 操作人 */
  actor: string;
  /** 操作动作 */
  action: string;
  /** 操作目标 */
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

export interface DashboardMetricItem {
  /** 指标名称 */
  label: string;
  /** 指标值 */
  value: string;
  /** 辅助说明 */
  helper: string;
  /** 展示色调 */
  tone: string;
}

export interface PlatformTodoItem {
  /** 待办标题 */
  title: string;
  /** 待办说明 */
  detail: string;
  /** 负责人 */
  owner: string;
  /** 优先级 */
  priority: string;
}

export interface TenantHealthItem {
  /** 租户名称 */
  tenant: string;
  /** 健康度 */
  health: number;
  /** 账号覆盖情况 */
  userCoverage: string;
  /** 异常说明 */
  exception: string;
  /** 负责人 */
  owner: string;
}

export interface LoginRiskEventItem {
  /** 登录账号 */
  account: string;
  /** 所属租户 */
  tenant: string;
  /** 风险事件 */
  event: string;
  /** 发生时间 */
  time: string;
  /** 风险等级 */
  level: string;
}

export interface PlatformOverviewGrowth {
  /** 新增租户数 */
  newTenants: number;
  /** 试用转正式数 */
  trialToFormal: number;
  /** 流失预警数 */
  churnWarning: number;
  /** 近 7 日每日新增租户数 */
  dailyTrend: number[];
}

export interface PlatformRenewalRiskItem {
  /** 租户名称 */
  tenantName: string;
  /** 由 serviceExpireAt 派生的距到期天数 */
  dueInDays: number;
  /** 负责人 */
  owner: string;
}

export interface PlatformOverviewResponse {
  /** 平台总流水 单位元 */
  totalFlow: number;
  /** 租户总数 */
  totalTenants: number;
  /** 本月新增租户数 */
  newTenantsThisMonth: number;
  /** 平台健康度 */
  healthScore: number;
  /** 增长趋势数据 */
  growth: PlatformOverviewGrowth;
  /** 续费风险列表 */
  renewalRisks: PlatformRenewalRiskItem[];
}

export interface RoleTemplateItem {
  /** 角色名称 */
  name: string;
  /** 所属侧别 */
  side: TenantSide;
  /** 权限编码列表 */
  permissions: string[];
}

export interface ConsoleInfoResponse {
  /** 产品名称 */
  productName: string;
  /** 控制台名称 */
  suiteName: string;
  /** 视角标签 */
  scopeLabel: string;
  /** 当前操作人 */
  operator: string;
  /** 当前角色 */
  role: string;
  /** 当前租户名称 */
  currentTenant: string;
}

export interface TenantListQuery extends ListParams {
  /** 状态筛选 */
  status?: TenantStatus;
  /** 排序字段 */
  sortBy?: TenantSortField;
  /** 排序方向 */
  sortOrder?: SortOrder;
}

export interface CreateTenantRequest {
  /** 租户名称 */
  name: string;
  /** 租户采购的软件版本级别 */
  softwareVersion: TenantSoftwareVersion;
  /** 老板姓名 */
  ownerName: string;
  /** 联系地址 */
  address: string;
  /** 营业执照号 */
  licenseNo: string;
  /** 初始支付通道 */
  channel: string;
  /** 租户采购服务到期日期，前端按 YYYY-MM-DD 提交 */
  serviceExpireAt: string;
  /** 首个老板登录账号，当前按手机号使用 */
  ownerAccount: string;
  /** 首个老板初始密码；不传则由服务端回退默认密码 */
  ownerInitialPassword?: string;
}

export interface UpdateTenantBaseInfoRequest {
  /** 租户名称 */
  name: string;
  /** 联系地址 */
  address: string;
  /** 统一社会信用代码 */
  licenseNo: string;
  /** 租户采购的软件版本级别 */
  softwareVersion: TenantSoftwareVersion;
  /** 租户采购服务到期日期，前端按 YYYY-MM-DD 提交 */
  serviceExpireAt: string;
}

export interface PatchTenantBaseInfoRequest {
  /** 租户名称 */
  name?: string;
  /** 联系地址 */
  address?: string;
  /** 统一社会信用代码 */
  licenseNo?: string;
  /** 租户采购的软件版本级别 */
  softwareVersion?: TenantSoftwareVersion;
  /** 租户采购服务到期日期，前端按 YYYY-MM-DD 提交 */
  serviceExpireAt?: string;
}

export interface CreateTenantAuditDecisionRequest {
  /** 审核动作 */
  action: ReviewAction;
  /** 审核备注 */
  reviewNote?: string;
  /** 驳回原因 */
  rejectReason?: string;
}

export interface TenantAuditDecisionResponse {
  /** 租户 ID */
  tenantId: string;
  /** 审核后的租户状态 */
  status: TenantStatus;
  /** 驳回原因 */
  rejectReason?: string | null;
  /** 审核完成时间 */
  reviewedAt: string;
}

export interface CreateTenantAuditBatchRequest {
  /** 待审核租户 ID 列表 */
  ids: string[];
  /** 批量审核动作 */
  action: 'approve';
  /** 审核备注 */
  reviewNote?: string;
}

export interface CreateTenantRenewalRequest {
  /** 续费后生效的软件版本级别 */
  softwareVersion: TenantSoftwareVersion;
  /** 续费后生效的服务到期日期，前端按 YYYY-MM-DD 提交 */
  serviceExpireAt: string;
  /** 续费金额 */
  amount: number;
  /** 支付方式 */
  paymentMethod: TenantRenewPaymentMethod;
}

export interface TenantRenewalResponse {
  /** 租户 ID */
  tenantId: string;
  /** 根据续费后软件版本级别派生的软件展示名称 */
  softwareName: string;
  /** 续费后生效的软件版本级别 */
  softwareVersion: TenantSoftwareVersion;
  /** 续费后的租户状态 */
  status: TenantStatus;
  /** 新服务到期时间 */
  serviceExpireAt: string;
  /** 续费完成时间 */
  renewedAt: string;
}

export interface FreezeTenantRequest {
  /** 冻结原因 */
  reason: string;
}

export interface TenantStatusMutationResponse {
  /** 租户 ID */
  tenantId: string;
  /** 变更后的租户状态 */
  status: TenantStatus;
  /** 冻结原因 */
  freezeReason?: string | null;
  /** 生效时间 */
  effectiveAt: string;
}

export interface CreateTenantStatusChangeBatchRequest {
  /** 租户 ID 列表 */
  ids: string[];
  /** 批量状态变更原因 */
  reason: string;
}

export interface TenantBatchActionResponse {
  /** 成功处理数量 */
  successCount: number;
  /** 处理失败的租户 ID 列表 */
  failedIds: string[];
}

export interface TenantMemberItem {
  /** 成员 ID */
  id: string;
  /** 成员姓名 */
  name: string;
  /** 登录账号 */
  account: string;
  /** 所属租户 */
  tenant: string;
  /** 所属侧别 */
  tenantType: TenantSide;
  /** 角色名称 */
  role: string;
  /** 用户状态 */
  status: UserStatus;
  /** 权限范围 */
  scope: string;
}

export interface TenantMemberListQuery {
  /** 页码 */
  page?: number;
  /** 每页条数 */
  pageSize?: number;
  /** 所属侧别筛选 */
  tenantType?: TenantSide;
}

export interface TenantCertificationRecordItem {
  /** 资质记录 ID */
  id: string;
  /** 租户名称 */
  tenant: string;
  /** 资质类型 */
  type: string;
  /** 提交时间 */
  submitAt: string;
  /** 资质状态 */
  status: TenantCertificationStatus;
  /** 审核说明 */
  comment?: string;
}

export interface TenantCertificationSubmitRequest {
  /** 营业执照图片地址 */
  licenseUrl: string;
  /** 法人姓名 */
  legalPerson: string;
  /** 法人身份证号 */
  legalIdCard: string;
  /** 联系电话 */
  contactPhone: string;
  /** 备注 */
  remark?: string;
}

export interface TenantCertificationSubmitResponse {
  /** 资质记录 ID */
  certId: string;
  /** 提交后的资质状态 */
  status: TenantCertificationStatus;
  /** 提交时间 */
  submittedAt: string;
}

export interface TenantCertificationStatusResult {
  /** 资质记录 ID */
  certId: string | null;
  /** 当前资质状态 */
  status: TenantCertificationStatus | null;
  /** 提交时间 */
  submittedAt: string | null;
  /** 审核时间 */
  reviewedAt: string | null;
  /** 审核说明 */
  reviewComment?: string | null;
  /** 驳回原因 */
  rejectReason: string | null;
}

export interface CreateTenantCertificationReviewDecisionRequest {
  /** 审核动作 */
  action: ReviewAction;
  /** 审核说明 */
  comment?: string;
}

export interface TenantCertificationReviewDecisionResponse {
  /** 资质记录 ID */
  id: string;
  /** 租户名称 */
  tenant: string;
  /** 资质类型 */
  type: string;
  /** 提交时间 */
  submitAt: string;
  /** 原状态 */
  previousStatus: TenantCertificationStatus;
  /** 新状态 */
  status: TenantCertificationStatus;
  /** 审核说明 */
  comment?: string;
  /** 审核完成时间 */
  reviewedAt: string;
}
