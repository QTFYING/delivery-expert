import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  CreateUserPasswordResetResponse as CreateUserPasswordResetResponseContract,
  TenantAuditDecisionResponse as TenantAuditDecisionResponseContract,
  TenantBatchActionResponse as TenantBatchActionResponseContract,
  TenantCertificationRecordItem as TenantCertificationRecordItemContract,
  TenantCertificationReviewDecisionResponse as TenantCertificationReviewDecisionResponseContract,
  TenantCertificationStatusResult as TenantCertificationStatusResultContract,
  TenantCertificationSubmitResponse as TenantCertificationSubmitResponseContract,
  TenantMemberItem as TenantMemberItemContract,
  TenantPaymentConfigListItem as TenantPaymentConfigListItemContract,
  TenantProfile as TenantProfileContract,
  TenantRecordItem as TenantRecordItemContract,
  TenantRenewalResponse as TenantRenewalResponseContract,
  TenantStatusMutationResponse as TenantStatusMutationResponseContract,
  UserRecordItem as UserRecordItemContract,
} from '@shou/types/contracts';
import type { PaginatedResponse } from '@shou/types/common';
import {
  PaymentChannelEnum,
  TenantCertificationStatusEnum,
  TenantPaymentConfigStatusEnum,
  TenantSideEnum,
  TenantSoftwareVersionEnum,
  TenantStatusEnum,
  UserStatusEnum,
} from '@shou/types/enums';
import { PaginatedResponseMetaSwagger } from '../common/swagger/paginated-response.swagger';

export class TenantProfileSwagger implements TenantProfileContract {
  @ApiProperty({ description: '租户 ID' })
  id!: string;

  @ApiProperty({ description: '租户名称', example: '华南一区商户A' })
  name!: string;

  @ApiProperty({ description: '根据软件版本级别派生的软件展示名称', example: '基础版' })
  softwareName!: string;

  @ApiProperty({ description: '租户采购的软件版本级别', enum: Object.values(TenantSoftwareVersionEnum), example: TenantSoftwareVersionEnum.L1 })
  softwareVersion!: TenantProfileContract['softwareVersion'];

  @ApiProperty({ description: '联系地址', example: '广州市天河区体育东路 88 号' })
  address!: string;

  @ApiProperty({ description: '统一社会信用代码', example: '91410100MA9F123456' })
  licenseNo!: string;

  @ApiProperty({ description: '联系电话', example: '13800138000' })
  contactPhone!: string;

  @ApiPropertyOptional({ description: '老板姓名', type: String, example: '张三', nullable: true })
  ownerName!: string | null;

  @ApiProperty({ description: '租户状态', enum: Object.values(TenantStatusEnum), example: TenantStatusEnum.ACTIVE })
  status!: TenantProfileContract['status'];

  @ApiPropertyOptional({ description: '驳回原因', example: '资料不完整' })
  rejectReason!: string | null;

  @ApiPropertyOptional({ description: '冻结原因', example: '到期未续费' })
  freezeReason!: string | null;

  @ApiPropertyOptional({ description: '租户采购服务到期时间', example: '2026-12-31T23:59:59.000Z', nullable: true })
  serviceExpireAt!: string | null;

  @ApiProperty({ description: '最大账期天数', example: 30 })
  maxCreditDays!: number;

  @ApiProperty({ description: '账期提醒天数', example: 3 })
  creditRemindDays!: number;

  @ApiProperty({ description: '创建时间', example: '2026-04-11T09:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ description: '更新时间', example: '2026-04-11T09:00:00.000Z' })
  updatedAt!: string;
}

export class TenantRecordItemSwagger implements TenantRecordItemContract {
  @ApiProperty({ description: '租户 ID' })
  id!: string;

  @ApiProperty({ description: '租户名称', example: '华南一区商户A' })
  name!: string;

  @ApiProperty({ description: '根据软件版本级别派生的软件展示名称', example: '基础版' })
  softwareName!: string;

  @ApiProperty({ description: '租户采购的软件版本级别', enum: Object.values(TenantSoftwareVersionEnum), example: TenantSoftwareVersionEnum.L1 })
  softwareVersion!: TenantRecordItemContract['softwareVersion'];

  @ApiProperty({ description: '老板姓名', example: '张三' })
  ownerName!: string;

  @ApiPropertyOptional({ description: '老板登录账号，当前按手机号使用', type: String, example: '13800138000', nullable: true })
  ownerAccount!: string | null;

  @ApiProperty({ description: '联系地址', example: '河南省郑州市金水区经三路 88 号' })
  address!: string;

  @ApiProperty({ description: '统一社会信用代码', example: '91410100MA9F123456' })
  licenseNo!: string;

  @ApiProperty({ description: '用户数', example: 5 })
  users!: number;

  @ApiPropertyOptional({
    description: '当前生效支付渠道；未设置时返回 null',
    enum: Object.values(PaymentChannelEnum),
    example: PaymentChannelEnum.LAKALA,
    nullable: true,
  })
  activePaymentChannel!: TenantRecordItemContract['activePaymentChannel'];

  @ApiProperty({ description: '本月流水（元）', example: 12800 })
  monthlyFlow!: number;

  @ApiPropertyOptional({ description: '租户采购服务到期时间', type: String, example: '2026-12-31T23:59:59.000Z', nullable: true })
  serviceExpireAt!: string | null;

  @ApiPropertyOptional({
    description: '由服务到期时间派生的距到期天数；未配置服务到期时间时返回 null',
    type: Number,
    example: 28,
    nullable: true,
  })
  dueInDays!: TenantRecordItemContract['dueInDays'];

  @ApiProperty({ description: '最后活跃时间', example: '2026-04-11T09:00:00.000Z' })
  lastActiveAt!: string;

  @ApiProperty({ description: '租户状态', enum: Object.values(TenantStatusEnum), example: TenantStatusEnum.ACTIVE })
  status!: TenantRecordItemContract['status'];

  @ApiPropertyOptional({ description: '驳回原因', type: String, nullable: true })
  rejectReason?: string | null;

  @ApiPropertyOptional({ description: '冻结原因', type: String, nullable: true })
  freezeReason?: string | null;
}

export class TenantListResponseSwagger extends PaginatedResponseMetaSwagger implements PaginatedResponse<TenantRecordItemContract> {
  @ApiProperty({ description: '租户列表', type: [TenantRecordItemSwagger] })
  list!: TenantRecordItemSwagger[];
}

export class TenantBatchActionResponseSwagger implements TenantBatchActionResponseContract {
  @ApiProperty({ description: '成功数量', example: 8 })
  successCount!: number;

  @ApiProperty({ description: '失败的 ID 列表', type: [String], example: ['T100001', 'T100002'] })
  failedIds!: string[];
}

export class TenantAuditDecisionResponseSwagger implements TenantAuditDecisionResponseContract {
  @ApiProperty({ description: '租户 ID' })
  tenantId!: string;

  @ApiProperty({
    description: '审核后的租户状态',
    enum: Object.values(TenantStatusEnum),
    example: TenantStatusEnum.ACTIVE,
  })
  status!: TenantAuditDecisionResponseContract['status'];

  @ApiPropertyOptional({ description: '驳回原因', example: '资料不完整' })
  rejectReason?: string | null;

  @ApiProperty({ description: '审核完成时间', example: '2026-04-16T10:00:00.000Z' })
  reviewedAt!: string;
}

export class TenantRenewalResponseSwagger implements TenantRenewalResponseContract {
  @ApiProperty({ description: '租户 ID' })
  tenantId!: string;

  @ApiProperty({ description: '根据续费后软件版本级别派生的软件展示名称', example: '标准版' })
  softwareName!: string;

  @ApiProperty({ description: '续费后生效的软件版本级别', enum: Object.values(TenantSoftwareVersionEnum), example: TenantSoftwareVersionEnum.L2 })
  softwareVersion!: TenantRenewalResponseContract['softwareVersion'];

  @ApiProperty({
    description: '续费后的租户状态',
    enum: Object.values(TenantStatusEnum),
    example: TenantStatusEnum.ACTIVE,
  })
  status!: TenantRenewalResponseContract['status'];

  @ApiProperty({ description: '新的服务到期时间', example: '2027-05-13T23:59:59.000Z' })
  serviceExpireAt!: string;

  @ApiProperty({ description: '续费完成时间', example: '2026-04-16T10:05:00.000Z' })
  renewedAt!: string;
}

export class TenantStatusMutationResponseSwagger implements TenantStatusMutationResponseContract {
  @ApiProperty({ description: '租户 ID' })
  tenantId!: string;

  @ApiProperty({
    description: '变更后的租户状态',
    enum: Object.values(TenantStatusEnum),
    example: TenantStatusEnum.PAUSED,
  })
  status!: TenantStatusMutationResponseContract['status'];

  @ApiPropertyOptional({ description: '冻结原因', example: '到期未续费' })
  freezeReason?: string | null;

  @ApiProperty({ description: '状态生效时间', example: '2026-04-16T10:10:00.000Z' })
  effectiveAt!: string;
}

export class TenantMemberItemSwagger implements TenantMemberItemContract {
  @ApiProperty({ description: '用户 ID' })
  id!: string;

  @ApiProperty({ description: '姓名', example: '李四' })
  name!: string;

  @ApiProperty({ description: '账号', example: '13800138000' })
  account!: string;

  @ApiProperty({ description: '所属租户', example: '华南一区商户A' })
  tenant!: string;

  @ApiProperty({ description: '所属侧', enum: Object.values(TenantSideEnum), example: TenantSideEnum.TENANT })
  tenantType!: TenantMemberItemContract['tenantType'];

  @ApiProperty({ description: '角色', example: 'TENANT_OPERATOR' })
  role!: string;

  @ApiProperty({ description: '用户状态', enum: Object.values(UserStatusEnum), example: UserStatusEnum.ACTIVE })
  status!: TenantMemberItemContract['status'];

  @ApiProperty({ description: '作用域', example: 'tenant:orders' })
  scope!: string;
}

export class TenantMemberListResponseSwagger extends PaginatedResponseMetaSwagger implements PaginatedResponse<TenantMemberItemContract> {
  @ApiProperty({ description: '成员列表', type: [TenantMemberItemSwagger] })
  list!: TenantMemberItemSwagger[];
}

export class TenantPaymentConfigListItemSwagger implements TenantPaymentConfigListItemContract {
  @ApiProperty({ description: '支付通道', enum: Object.values(PaymentChannelEnum), example: PaymentChannelEnum.LAKALA })
  channel!: TenantPaymentConfigListItemContract['channel'];

  @ApiProperty({ description: '所属租户 ID' })
  tenantId!: string;

  @ApiProperty({ description: '所属租户名称', example: '华南一区商户A' })
  tenantName!: string;

  @ApiProperty({
    description: '配置状态',
    enum: Object.values(TenantPaymentConfigStatusEnum),
    example: TenantPaymentConfigStatusEnum.AVAILABLE,
  })
  status!: TenantPaymentConfigListItemContract['status'];

  @ApiPropertyOptional({ description: '配置无效原因', example: '商户号无效', nullable: true })
  invalidReason!: string | null;

  @ApiPropertyOptional({ description: '最近一次校验时间', example: '2026-05-07T08:30:00.000Z', nullable: true })
  lastValidatedAt!: string | null;

  @ApiProperty({ description: '最近更新时间', example: '2026-05-07T08:31:00.000Z' })
  updatedAt!: string;

  @ApiPropertyOptional({ description: '最近更新人', example: 'OS_SUPER_ADMIN', nullable: true })
  updatedBy!: string | null;

  @ApiProperty({ description: '租户状态', enum: Object.values(TenantStatusEnum), example: TenantStatusEnum.ACTIVE })
  tenantStatus!: TenantPaymentConfigListItemContract['tenantStatus'];
}

export class TenantPaymentConfigListResponseSwagger
  extends PaginatedResponseMetaSwagger
  implements PaginatedResponse<TenantPaymentConfigListItemContract>
{
  @ApiProperty({ description: '租户收单配置列表', type: [TenantPaymentConfigListItemSwagger] })
  list!: TenantPaymentConfigListItemSwagger[];
}

export class TenantCertificationRecordItemSwagger implements TenantCertificationRecordItemContract {
  @ApiProperty({ description: '资质记录 ID' })
  id!: string;

  @ApiProperty({ description: '租户名称', example: '华南一区商户A' })
  tenant!: string;

  @ApiProperty({ description: '资质类型', example: '企业实名认证' })
  type!: string;

  @ApiProperty({ description: '提交时间', example: '2026-04-11T09:00:00.000Z' })
  submitAt!: string;

  @ApiProperty({
    description: '资质状态',
    enum: Object.values(TenantCertificationStatusEnum),
    example: TenantCertificationStatusEnum.PENDING_INITIAL_REVIEW,
  })
  status!: TenantCertificationRecordItemContract['status'];

  @ApiPropertyOptional({ description: '审核备注', example: '待补营业执照副本' })
  comment?: string;
}

export class TenantCertificationSubmitResponseSwagger implements TenantCertificationSubmitResponseContract {
  @ApiProperty({ description: '资质记录 ID' })
  certId!: string;

  @ApiProperty({
    description: '提交后的资质状态',
    enum: Object.values(TenantCertificationStatusEnum),
    example: TenantCertificationStatusEnum.PENDING_INITIAL_REVIEW,
  })
  status!: TenantCertificationSubmitResponseContract['status'];

  @ApiProperty({ description: '提交时间', example: '2026-04-11T09:00:00.000Z' })
  submittedAt!: string;
}

export class TenantCertificationStatusResultSwagger implements TenantCertificationStatusResultContract {
  @ApiPropertyOptional({ description: '资质记录 ID', nullable: true })
  certId!: string | null;

  @ApiPropertyOptional({
    description: '当前资质状态',
    enum: Object.values(TenantCertificationStatusEnum),
    nullable: true,
  })
  status!: TenantCertificationStatusResultContract['status'];

  @ApiPropertyOptional({ description: '提交时间', nullable: true })
  submittedAt!: string | null;

  @ApiPropertyOptional({ description: '最近审核时间', nullable: true })
  reviewedAt!: string | null;

  @ApiPropertyOptional({ description: '审核备注', nullable: true })
  reviewComment?: string | null;

  @ApiPropertyOptional({ description: '驳回原因', nullable: true })
  rejectReason!: string | null;
}

export class TenantCertificationReviewDecisionResponseSwagger implements TenantCertificationReviewDecisionResponseContract {
  @ApiProperty({ description: '资质记录 ID' })
  id!: string;

  @ApiProperty({ description: '租户名称', example: '华南一区商户A' })
  tenant!: string;

  @ApiProperty({ description: '资质类型', example: '企业实名认证' })
  type!: string;

  @ApiProperty({ description: '提交时间', example: '2026-04-11T09:00:00.000Z' })
  submitAt!: string;

  @ApiProperty({
    description: '变更前状态',
    enum: Object.values(TenantCertificationStatusEnum),
    example: TenantCertificationStatusEnum.PENDING_INITIAL_REVIEW,
  })
  previousStatus!: TenantCertificationReviewDecisionResponseContract['previousStatus'];

  @ApiProperty({
    description: '变更后状态',
    enum: Object.values(TenantCertificationStatusEnum),
    example: TenantCertificationStatusEnum.PENDING_SECONDARY_REVIEW,
  })
  status!: TenantCertificationReviewDecisionResponseContract['status'];

  @ApiPropertyOptional({ description: '审核备注', example: '进入复核阶段' })
  comment?: string;

  @ApiProperty({ description: '审核时间', example: '2026-04-11T10:00:00.000Z' })
  reviewedAt!: string;
}

export class UserRecordItemSwagger implements UserRecordItemContract {
  @ApiProperty({ description: '用户 ID' })
  id!: string;

  @ApiProperty({ description: '账号', example: 'admin001' })
  account!: string;

  @ApiProperty({ description: '姓名', example: '平台管理员A' })
  name!: string;

  @ApiProperty({ description: '所属租户', example: '平台' })
  tenant!: string;

  @ApiProperty({ description: '所属侧', enum: Object.values(TenantSideEnum), example: TenantSideEnum.PLATFORM })
  tenantType!: UserRecordItemContract['tenantType'];

  @ApiProperty({ description: '角色', example: 'OS_SUPER_ADMIN' })
  role!: string;

  @ApiProperty({ description: '作用域', example: 'platform:all' })
  scope!: string;

  @ApiProperty({ description: '手机号', example: '13800138000' })
  phone!: string;

  @ApiProperty({ description: '状态', enum: Object.values(UserStatusEnum), example: UserStatusEnum.ACTIVE })
  status!: UserRecordItemContract['status'];

  @ApiProperty({ description: '最后登录时间', example: '2026-04-11T09:00:00.000Z' })
  loginAt!: string;

  @ApiProperty({ description: '是否需要重置密码', example: true })
  requiresPasswordReset!: boolean;
}

export class UserListResponseSwagger extends PaginatedResponseMetaSwagger implements PaginatedResponse<UserRecordItemContract> {
  @ApiProperty({ description: '平台用户列表', type: [UserRecordItemSwagger] })
  list!: UserRecordItemSwagger[];
}

export class CreateUserPasswordResetResponseSwagger implements CreateUserPasswordResetResponseContract {
  @ApiProperty({ description: '是否要求下次登录强制修改密码', example: true })
  requiresPasswordReset!: true;
}
