import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  AuditLogRecord as AuditLogRecordContract,
  GetPrintingConfigDetailResponse as GetPrintingConfigDetailResponseContract,
  GetPrintingConfigListResponse as GetPrintingConfigListResponseContract,
  GetTenantPaymentConfigListResponse as GetTenantPaymentConfigListResponseContract,
  PrintingConfigListItem as PrintingConfigListItemContract,
  TenantPaymentConfigListItem as TenantPaymentConfigListItemContract,
  TenantPaymentConfigSnapshot as TenantPaymentConfigSnapshotContract,
  TenantAuditLogListResponse as TenantAuditLogListResponseContract,
  TenantGeneralSettings as TenantGeneralSettingsContract,
  TenantPermissionDomainNode as TenantPermissionDomainNodeContract,
  TenantPermissionItem as TenantPermissionItemContract,
  TenantPermissionTreeResponse as TenantPermissionTreeResponseContract,
  TenantRoleAccount as TenantRoleAccountContract,
  TenantSettingsUser as TenantSettingsUserContract,
  UpdatePrintingConfigResponse as UpdatePrintingConfigResponseContract,
} from '@shou/types/contracts';
import {
  PaymentChannelEnum,
  TenantPaymentConfigStatusEnum,
  TenantPermissionCodeEnum,
  TenantPermissionDomainEnum,
  TenantStatusEnum,
  UserSimpleStatusEnum,
} from '@shou/types/enums';
import { PaginatedResponseMetaSwagger } from '../common/swagger/paginated-response.swagger';

export class TenantPermissionItemSwagger implements TenantPermissionItemContract {
  @ApiProperty({ description: '权限编码', enum: Object.values(TenantPermissionCodeEnum), example: TenantPermissionCodeEnum.ORDERS_READ })
  code!: TenantPermissionItemContract['code'];

  @ApiProperty({ description: '服务端业务能力说明，不代表前端菜单文案', example: '查看订单' })
  description!: string;
}

export class TenantPermissionDomainNodeSwagger implements TenantPermissionDomainNodeContract {
  @ApiProperty({ description: '权限所属业务域', enum: Object.values(TenantPermissionDomainEnum), example: TenantPermissionDomainEnum.ORDERS })
  domain!: TenantPermissionDomainNodeContract['domain'];

  @ApiProperty({ description: '服务端业务域说明，不代表前端菜单文案', example: '订单域' })
  description!: string;

  @ApiProperty({ description: '当前业务域下的权限项', type: [TenantPermissionItemSwagger] })
  permissions!: TenantPermissionItemSwagger[];
}

export class TenantPermissionTreeResponseSwagger implements TenantPermissionTreeResponseContract {
  @ApiProperty({ description: '权限能力树版本', example: 'tenant-rbac-2026-05-26' })
  version!: string;

  @ApiProperty({ description: '按业务域分组的权限能力列表', type: [TenantPermissionDomainNodeSwagger] })
  domains!: TenantPermissionDomainNodeSwagger[];
}

export class TenantRoleAccountSwagger implements TenantRoleAccountContract {
  @ApiProperty({ description: '角色 ID' })
  id!: string;

  @ApiProperty({ description: '角色编码；内置角色使用 TENANT_*，自定义角色由服务端生成', example: 'TENANT_FINANCE' })
  code!: string;

  @ApiProperty({ description: '角色名称', example: '财务' })
  name!: string;

  @ApiPropertyOptional({ description: '角色描述', example: '负责核销与对账' })
  description?: string;

  @ApiProperty({
    description: '权限编码列表',
    enum: Object.values(TenantPermissionCodeEnum),
    isArray: true,
    example: [TenantPermissionCodeEnum.PAYMENTS_READ, TenantPermissionCodeEnum.FINANCE_READ],
  })
  permissions!: TenantRoleAccountContract['permissions'];

  @ApiProperty({ description: '是否系统内置角色', example: true })
  isSystem!: boolean;

  @ApiProperty({ description: '是否允许编辑', example: false })
  isEditable!: boolean;

  @ApiProperty({ description: '角色绑定用户数', example: 2 })
  userCount!: number;

  @ApiPropertyOptional({ description: '创建时间', example: '2026-05-28T09:00:00.000Z' })
  createdAt?: string;

  @ApiPropertyOptional({ description: '更新时间', example: '2026-05-28T09:30:00.000Z' })
  updatedAt?: string;
}

export class TenantSettingsUserSwagger implements TenantSettingsUserContract {
  @ApiProperty({ description: '用户 ID' })
  id!: string;

  @ApiProperty({ description: '姓名', example: '李四' })
  name!: string;

  @ApiProperty({ description: '当前角色 ID', example: '0c04ef8c-cfde-40a4-a553-9ab8d31a448d' })
  roleId!: string;

  @ApiProperty({ description: '当前角色编码', example: 'TENANT_FINANCE' })
  roleCode!: string;

  @ApiProperty({ description: '当前角色名称', example: '财务' })
  roleName!: string;

  @ApiProperty({ description: '手机号', example: '13800138000' })
  phone!: string;

  @ApiProperty({ description: '状态', enum: Object.values(UserSimpleStatusEnum), example: UserSimpleStatusEnum.ACTIVE })
  status!: TenantSettingsUserContract['status'];

  @ApiProperty({ description: '最后登录时间', example: '2026-04-11T09:00:00.000Z' })
  lastLogin!: string;
}

export class TenantGeneralSettingsSwagger implements TenantGeneralSettingsContract {
  @ApiProperty({ description: '订单可支付有效期（单位：天）', example: 30 })
  qrCodeExpiry!: number;

  @ApiProperty({ description: '是否通知业务员', example: true })
  notifySeller!: boolean;

  @ApiProperty({ description: '是否通知老板', example: true })
  notifyOwner!: boolean;

  @ApiProperty({ description: '是否通知财务', example: true })
  notifyFinance!: boolean;

  @ApiProperty({ description: '账期提醒提前天数', example: 3 })
  creditRemindDays!: number;

  @ApiProperty({ description: '是否推送每日收款日报', example: true })
  dailyReportPush!: boolean;
}

export class TenantPaymentConfigSnapshotSwagger implements TenantPaymentConfigSnapshotContract {
  @ApiProperty({ description: '支付通道', enum: Object.values(PaymentChannelEnum), example: PaymentChannelEnum.LAKALA })
  channel!: TenantPaymentConfigSnapshotContract['channel'];

  @ApiProperty({ description: '所属租户 ID' })
  tenantId!: string;

  @ApiPropertyOptional({ description: '所属租户名称', example: '华南一区商户A', nullable: true })
  tenantName?: string | null;

  @ApiProperty({
    description: '配置状态',
    enum: Object.values(TenantPaymentConfigStatusEnum),
    example: TenantPaymentConfigStatusEnum.AVAILABLE,
  })
  status!: TenantPaymentConfigSnapshotContract['status'];

  @ApiPropertyOptional({ description: '是否为当前生效支付渠道', example: true })
  isCurrentActive?: boolean;

  @ApiPropertyOptional({ description: '配置无效原因', example: '商户号无效', nullable: true })
  invalidReason!: string | null;

  @ApiPropertyOptional({ description: '最近一次校验时间', example: '2026-05-07T08:30:00.000Z', nullable: true })
  lastValidatedAt!: string | null;

  @ApiPropertyOptional({ description: '最近更新时间', example: '2026-05-07T08:31:00.000Z', nullable: true })
  updatedAt!: string | null;

  @ApiPropertyOptional({ description: '最近更新人', example: 'TENANT_OWNER', nullable: true })
  updatedBy!: string | null;

  @ApiPropertyOptional({
    description: '渠道专属配置；lakala 结构为 merchantNo / terminalNo，其他渠道按适配进度保存黑盒配置',
    type: 'object',
    additionalProperties: true,
    nullable: true,
    example: { merchantNo: '8222900533118A3', terminalNo: '001' },
  })
  config!: Record<string, unknown> | null;
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

  @ApiPropertyOptional({ description: '最近一次校验时间', example: '2026-05-08T08:30:00.000Z', nullable: true })
  lastValidatedAt!: string | null;

  @ApiPropertyOptional({ description: '最近更新时间', example: '2026-05-08T08:31:00.000Z', nullable: true })
  updatedAt!: string | null;

  @ApiPropertyOptional({ description: '最近更新人', example: 'TENANT_OWNER', nullable: true })
  updatedBy!: string | null;

  @ApiProperty({ description: '租户状态', enum: Object.values(TenantStatusEnum), example: TenantStatusEnum.ACTIVE })
  tenantStatus!: TenantPaymentConfigListItemContract['tenantStatus'];
}

export class GetTenantPaymentConfigListResponseSwagger implements GetTenantPaymentConfigListResponseContract {
  @ApiPropertyOptional({
    description: '当前生效支付渠道',
    enum: Object.values(PaymentChannelEnum),
    example: PaymentChannelEnum.LAKALA,
    nullable: true,
  })
  activePaymentChannel!: GetTenantPaymentConfigListResponseContract['activePaymentChannel'];

  @ApiProperty({ description: '支付渠道配置摘要列表', type: [TenantPaymentConfigListItemSwagger] })
  items!: TenantPaymentConfigListItemSwagger[];
}

export class PrintingConfigListItemSwagger implements PrintingConfigListItemContract {
  @ApiProperty({ description: '导入映射模板 ID' })
  importTemplateId!: string;

  @ApiProperty({ description: '导入映射模板名称', example: '饮品导入模板' })
  importTemplateName!: string;

  @ApiProperty({ description: '是否存在自定义打印配置', example: true })
  hasCustomConfig!: boolean;

  @ApiPropertyOptional({ description: '配置版本号', example: 3 })
  configVersion?: number;

  @ApiPropertyOptional({ description: '最近更新时间', example: '2026-04-11T09:00:00.000Z' })
  updatedAt?: string;

  @ApiPropertyOptional({ description: '最近更新人', example: 'TENANT_OWNER' })
  updatedBy?: string;

  @ApiPropertyOptional({ description: '备注', example: '适配饮品送货单' })
  remark?: string;
}

export class GetPrintingConfigListResponseSwagger implements GetPrintingConfigListResponseContract {
  @ApiProperty({ description: '打印配置摘要列表', type: [PrintingConfigListItemSwagger] })
  items!: PrintingConfigListItemSwagger[];
}

export class GetPrintingConfigDetailResponseSwagger implements GetPrintingConfigDetailResponseContract {
  @ApiProperty({ description: '导入映射模板 ID' })
  importTemplateId!: string;

  @ApiPropertyOptional({ description: '导入映射模板名称', example: '饮品导入模板' })
  importTemplateName?: string;

  @ApiProperty({ description: '是否存在自定义配置', example: true })
  hasCustomConfig!: boolean;

  @ApiPropertyOptional({ description: '配置版本号', example: 3 })
  configVersion?: number;

  @ApiPropertyOptional({
    description: '打印配置 JSON 黑盒快照',
    type: 'object',
    additionalProperties: true,
    example: { page: { width: 210, height: 297 }, fields: [{ key: 'customer', x: 20, y: 30 }] },
  })
  config?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '最近更新时间', example: '2026-04-11T09:00:00.000Z' })
  updatedAt?: string;

  @ApiPropertyOptional({ description: '最近更新人', example: 'TENANT_OWNER' })
  updatedBy?: string;

  @ApiPropertyOptional({ description: '备注', example: '适配饮品送货单' })
  remark?: string;
}

export class UpdatePrintingConfigResponseSwagger implements UpdatePrintingConfigResponseContract {
  @ApiProperty({ description: '导入映射模板 ID' })
  importTemplateId!: string;

  @ApiProperty({ description: '是否存在自定义配置', example: true })
  hasCustomConfig!: boolean;

  @ApiProperty({ description: '最新配置版本号', example: 4 })
  configVersion!: number;

  @ApiProperty({ description: '更新时间', example: '2026-04-11T09:00:00.000Z' })
  updatedAt!: string;

  @ApiPropertyOptional({ description: '更新人', example: 'TENANT_OWNER' })
  updatedBy?: string;

  @ApiPropertyOptional({ description: '备注', example: '适配饮品送货单' })
  remark?: string;
}

export class AuditLogRecordSwagger implements AuditLogRecordContract {
  @ApiProperty({ description: '日志 ID' })
  id!: string;

  @ApiProperty({ description: '操作内容', example: '更新通用配置' })
  action!: string;

  @ApiProperty({ description: '操作人', example: '张三' })
  operator!: string;

  @ApiProperty({ description: '操作 IP', example: '127.0.0.1' })
  ip!: string;

  @ApiProperty({ description: '操作时间', example: '2026-04-11T09:00:00.000Z' })
  createdAt!: string;
}

export class TenantAuditLogListResponseSwagger extends PaginatedResponseMetaSwagger implements TenantAuditLogListResponseContract {
  @ApiProperty({ description: '日志列表', type: [AuditLogRecordSwagger] })
  list!: AuditLogRecordSwagger[];
}
