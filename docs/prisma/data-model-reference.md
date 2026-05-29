# 收单吧 SaaS 平台 — 数据模型说明书

> 本文件仅作为当前 `apps/api/prisma/schema.prisma` 的说明书，不作为 `schema.prisma` 设计或迭代的前置事实源。
> 涉及业务语义、字段含义、状态机与对外结构时，以上游 `docs/api/*.md -> packages/types/src/enums -> packages/types/src/contracts` 为准。
> `apps/api/prisma/schema.prisma` 是当前可执行基准，本文只做人工可读同步。
> 确认日期：2026-05-27
> 业务枚举闭集事实源统一维护在 `packages/types/src/enums`。

---

## 1. 当前模型总览

当前 `schema.prisma` 共定义 23 个 model：

| Prisma Model            | 表名                      | 说明               |
| ----------------------- | ------------------------- | ------------------ |
| `Tenant`                | `tenants`                 | 租户主体           |
| `User`                  | `users`                   | 用户账号           |
| `TenantRole`            | `tenant_roles`            | 租户角色定义       |
| `TenantRolePermission`  | `tenant_role_permissions` | 租户角色权限绑定   |
| `UserRoleAssignment`    | `user_role_assignments`   | 用户角色绑定       |
| `TenantGeneralSettings` | `tenant_general_settings` | 租户通用配置覆盖层 |
| `TenantPaymentConfig`   | `tenant_payment_configs`  | 租户支付渠道配置   |
| `SystemConfig`          | `system_configs`          | 平台系统配置       |
| `ImportTemplate`        | `import_templates`        | 导入映射模板       |
| `PrinterTemplate`       | `printer_templates`       | 打印模板配置       |
| `ImportJob`             | `import_jobs`             | 异步导入任务       |
| `Order`                 | `orders`                  | 订单主表           |
| `OrderItem`             | `order_items`             | 订单行项目         |
| `Payment`               | `payments`                | 收款流水           |
| `PaymentOrder`          | `payment_orders`          | H5 支付单          |
| `PaymentWebhookEvent`   | `payment_webhook_events`  | 支付回调审计事件   |
| `OrderPrintRecord`      | `order_print_records`     | 订单打印事件流     |
| `OrderReminder`         | `order_reminders`         | 催款记录           |
| `Notice`                | `notices`                 | 系统公告           |
| `NoticeRead`            | `notice_reads`            | 公告已读状态       |
| `TenantCertification`   | `tenant_certifications`   | 资质审核记录       |
| `AuditLog`              | `audit_logs`              | 审计日志           |
| `IdSequence`            | `id_sequences`            | 编号序列           |

## 2. 建模规则摘要

- 多租户业务表默认显式包含 `tenantId`。
- 金额字段统一使用 `Decimal`。
- 黑盒扩展配置统一使用 `Json`。
- 闭集字段的实际值以上游枚举事实源为准。
- `deletedAt` 仅出现在当前 schema 明确声明软删的表中。
- 事件时间字段在 Prisma 中使用 `DateTime @db.Timestamptz(3)`，API 以 ISO 8601 UTC 字符串投影；`IdSequence.dateKey` 是业务日期键，保留 `@db.Date`。
- Prisma 无法表达的 partial / expression index 由正式迁移 SQL 维护，本文在对应表约束中显式标注。

## 3. 枚举摘要

当前 schema 使用以下枚举：

- `UserRoleEnum`
  `OS_SUPER_ADMIN`、`TENANT_OWNER`、`TENANT_OPERATOR`、`TENANT_FINANCE`、`TENANT_VIEWER`
- `TenantStatusEnum`
  `active`、`onboarding`、`attention`、`paused`
- `TenantSoftwareVersionEnum`
  `L1`、`L2`、`L3`
- `UserStatusEnum`
  `active`、`invited`、`locked`、`disabled`
- `TenantCertificationStatusEnum`
  `pending_initial_review`、`pending_secondary_review`、`pending_confirmation`、`approved`、`rejected`
- `AuditTargetTypeEnum`
  `account`、`role`、`tenant`
- `AuditResultEnum`
  `success`、`pending`
- `OrderStatusEnum`
  `pending`、`partial`、`paid`、`expired`、`credit`
- `OrderPayTypeEnum`
  `cash`、`credit`
- `PrintRecordResultEnum`
  `success`、`failed`
- `OrderImportJobStatusEnum`
  `pending`、`processing`、`completed`、`failed`
- `OrderImportConflictPolicyEnum`
  `skip`、`overwrite`
- `PaymentMethodEnum`
  `online`、`cash`、`other_paid`
- `PaymentChannelEnum`
  `lakala`、`shouqianba`、`pingan_bank`
- `TenantPaymentConfigStoredStatusEnum`
  `pending_validation`、`available`、`disabled`、`invalid`
  `not_configured` 为 API 虚拟态，由缺失 `tenant_payment_configs` 记录推导，不在库内持久化
- `PaymentOrderStatusEnum`
  `unpaid`、`paying`、`pending_verification`、`paid`、`expired`
- `CashVerifyStatusEnum`
  `pending`、`verified`
- `PaymentRecordStatusEnum`
  `success`、`partial`、`pending`、`failed`
- `PaymentWebhookEventStatusEnum`
  `received`、`processed`、`ignored`、`rejected`、`failed`
- `OrderReminderStatusEnum`
  `sent`、`failed`
- `PublishTimingEnum`
  `immediate`、`scheduled`
- `NoticeStatusEnum`
  `published`、`draft`、`offline`

## 4. 模型说明

### 4.1 租户与账号域

**tenants**

```typescript
{
  id: string; // 租户 ID
  name: string; // 租户名称
  contactPhone: string; // 联系电话
  softwareVersion: TenantSoftwareVersionEnum; // 租户采购的软件版本级别
  adminName: string | null; // 管理员姓名
  address: string | null; // 联系地址
  licenseNo: string | null; // 营业执照号
  status: TenantStatusEnum; // 租户状态
  rejectReason: string | null; // 驳回原因
  freezeReason: string | null; // 冻结原因
  serviceExpireAt: string | null; // 租户采购服务到期时间
  maxCreditDays: number; // 最大账期天数
  creditReminderDays: number; // 账期提醒提前天数
  activePaymentChannel: PaymentChannelEnum | null; // 当前生效支付渠道
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
  deletedAt: string | null; // 软删时间
}
```

关键约束：

- 主键：`id`
- 表名：`tenants`
- 索引：`(deletedAt, createdAt)`、`(deletedAt, status)`、`(deletedAt, serviceExpireAt)`
- `activePaymentChannel = null` 表示当前没有生效中的线上支付渠道
- 当前 schema 使用 `deletedAt` 软删

**users**

```typescript
{
  id: string; // 用户 ID，UUID
  tenantId: string | null; // 所属租户 ID，平台用户为空
  account: string; // 登录账号
  phone: string | null; // 手机号
  passwordHash: string; // 加密后的密码
  realName: string; // 真实姓名
  role: UserRoleEnum; // 角色
  scope: string | null; // 数据范围描述
  status: UserStatusEnum; // 账号状态
  requiresPasswordReset: boolean; // 是否要求下次登录修改密码
  loginAt: string | null; // 最近登录时间
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
  deletedAt: string | null; // 软删时间
}
```

关键约束：

- 主键：`id`
- 唯一键：`account`、`(tenantId, id)`
- 索引：`(deletedAt, createdAt)`、`(tenantId, deletedAt, role, status)`、`status`
- 表名：`users`
- 当前 schema 使用 `deletedAt` 软删

**tenant_roles**

```typescript
{
  id: string; // 角色 ID，UUID
  tenantId: string; // 租户 ID
  code: string; // 角色编码，内置角色使用 TENANT_*，自定义角色由服务端生成
  name: string; // 角色名称
  description: string | null; // 角色描述
  isSystem: boolean; // 是否系统内置角色
  isEditable: boolean; // 是否允许编辑
  sortOrder: number; // 排序号
  createdBy: string | null; // 创建人用户 ID
  updatedBy: string | null; // 最近更新人用户 ID
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
  deletedAt: string | null; // 软删时间
}
```

关键约束：

- 主键：`id`
- 唯一键：`(tenantId, code)`、`(tenantId, id)`
- 索引：`(tenantId, deletedAt)`、`(tenantId, isSystem, sortOrder)`
- 表名：`tenant_roles`
- 手写迁移维护 partial expression unique：`(tenantId, lower(name)) WHERE deletedAt IS NULL`
- `tenantId` 必须显式存在，所有查询和写入都要按租户隔离
- 当前 schema 使用 `deletedAt` 软删

**tenant_role_permissions**

```typescript
{
  roleId: string; // 角色 ID，UUID
  permissionCode: string; // 权限编码，业务层校验属于 TenantPermissionCode 闭集
  createdAt: string; // 创建时间
}
```

关键约束：

- 复合主键：`(roleId, permissionCode)`
- 索引：`permissionCode`
- 表名：`tenant_role_permissions`
- `permissionCode` 存储为字符串，数据库不维护权限定义事实源

**user_role_assignments**

```typescript
{
  id: string; // 用户角色绑定 ID，UUID
  tenantId: string; // 租户 ID
  userId: string; // 用户 ID，UUID
  roleId: string; // 角色 ID，UUID
  isPrimary: boolean; // 是否主角色，当前阶段恒为 true
  createdBy: string | null; // 创建人用户 ID
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
}
```

关键约束：

- 主键：`id`
- 唯一键：`(tenantId, userId)`
- 索引：`(tenantId, roleId)`
- 表名：`user_role_assignments`
- 当前产品层面只允许一个用户绑定一个角色
- 用户与角色均通过复合外键绑定 `tenantId`，避免跨租户绑定

**tenant_general_settings**

```typescript
{
  tenantId: string; // 租户 ID
  qrCodeExpiry: number | null; // 订单可支付有效期覆盖值（天）
  notifySeller: boolean | null; // 是否通知业务员
  notifyOwner: boolean | null; // 是否通知老板
  notifyFinance: boolean | null; // 是否通知财务
  creditRemindDays: number | null; // 账期提醒提前天数覆盖值
  dailyReportPush: boolean | null; // 是否开启日报推送
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
}
```

关键约束：

- 主键：`tenantId`
- 与 `tenants` 一对一
- 表名：`tenant_general_settings`

**tenant_certifications**

```typescript
{
  id: string; // 资质记录 ID
  tenantId: string; // 租户 ID
  type: string; // 资质类型
  licenseUrl: string; // 资质文件地址
  legalPerson: string; // 法人姓名
  legalIdCard: string; // 法人身份证号
  contactPhone: string; // 联系电话
  remark: string | null; // 提交备注
  status: TenantCertificationStatusEnum; // 审核状态
  comment: string | null; // 审核备注
  rejectReason: string | null; // 驳回原因
  submitAt: string; // 提交时间
  reviewedAt: string | null; // 审核时间
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
}
```

关键约束：

- 主键：`id`
- 索引：`(tenantId, submitAt)`、`(status, submitAt)`
- 表名：`tenant_certifications`

**system_configs**

```typescript
{
  group: string; // 配置分组
  key: string; // 配置键
  value: string; // 配置值
  note: string | null; // 备注说明
}
```

关键约束：

- 复合主键：`(group, key)`
- 表名：`system_configs`

**audit_logs**

```typescript
{
  id: number; // 日志 ID，BigInt 自增
  actor: string; // 操作人
  action: string; // 操作动作
  target: string; // 操作对象
  targetType: AuditTargetTypeEnum; // 操作对象类型
  tenantId: string | null; // 关联租户 ID
  result: AuditResultEnum; // 执行结果
  ip: string | null; // 来源 IP
  time: string; // 操作时间
}
```

关键约束：

- 主键：`id`，`BigInt` 自增
- 索引：`(tenantId, time)`、`(targetType, time)`
- 表名：`audit_logs`

### 4.2 导入与打印域

**import_templates**

```typescript
{
  id: number; // 模板 ID，BigInt 自增
  tenantId: string; // 租户 ID
  name: string; // 模板名称
  isDefault: boolean; // 是否默认模板
  defaultFields: any; // 默认字段映射数组，Json
  customerFields: any; // 自定义字段映射数组，Json
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
  deletedAt: string | null; // 软删时间
}
```

关键约束：

- 主键：`id`
- 唯一键：`(tenantId, id)`
- 索引：`(tenantId, deletedAt, createdAt)`
- 表名：`import_templates`
- 手写迁移维护 partial expression unique：`(tenantId, lower(name)) WHERE deletedAt IS NULL`
- 当前 schema 使用 `deletedAt` 软删

**printer_templates**

```typescript
{
  id: number; // 打印模板 ID，BigInt 自增
  tenantId: string; // 租户 ID
  importTemplateId: number; // 绑定的导入模板 ID，BigInt
  config: any; // 打印配置快照，Json
  configVersion: number; // 配置版本号
  remark: string | null; // 备注
  updatedBy: string | null; // 最近更新人
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
}
```

关键约束：

- 主键：`id`
- 唯一键：`(tenantId, importTemplateId)`
- 表名：`printer_templates`
- 通过复合外键 `(tenantId, importTemplateId)` 绑定 `import_templates(tenantId, id)`，避免跨租户绑定打印配置

**import_jobs**

```typescript
{
  id: string; // 导入任务 ID
  tenantId: string; // 租户 ID
  status: OrderImportJobStatusEnum; // 任务状态
  conflictPolicy: OrderImportConflictPolicyEnum; // 冲突处理策略
  snapshot: any | null; // 导入快照，Json
  submittedCount: number; // 提交总数
  processedCount: number; // 已处理数量
  successCount: number; // 成功数量
  skippedCount: number; // 跳过数量
  overwrittenCount: number; // 覆盖数量
  failedCount: number; // 失败数量
  failedOrders: any | null; // 失败订单明细，Json
  conflictDetails: any | null; // 冲突明细，Json
  startedAt: string | null; // 开始时间
  heartbeatAt: string | null; // 最近心跳时间
  completedAt: string | null; // 完成时间
  lastError: string | null; // 最近一次任务错误
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
}
```

关键约束：

- 主键：`id`
- 索引：`(tenantId, status, createdAt)`、`(status, heartbeatAt)`
- 表名：`import_jobs`

**order_print_records**

```typescript
{
  id: string; // 打印事件 ID
  tenantId: string; // 租户 ID
  orderId: string; // 关联订单 ID
  operatorId: string | null; // 操作人 ID，UUID
  operatorName: string | null; // 操作人姓名快照
  result: PrintRecordResultEnum; // 打印结果：success | failed
  failureReason: string | null; // 失败原因，仅 failed 场景有值
  printedAt: string; // 事件时间
  requestId: string | null; // 幂等请求号
  remark: string | null; // 备注
  createdAt: string; // 创建时间
}
```

关键约束：

- 主键：`id`
- 唯一键：`(tenantId, requestId)`
- 索引：`(tenantId, orderId, printedAt DESC)`、`(tenantId, printedAt DESC)`、`(tenantId, result, printedAt DESC)`
- 表名：`order_print_records`
- 该表为 append-only 事件流，只允许插入，不提供更新语义

### 4.3 订单域

**orders**

```typescript
{
  id: string; // 订单 ID
  tenantId: string; // 租户 ID
  sourceOrderNo: string | null; // 源订单号
  groupKey: string | null; // 防重辅键
  mappingTemplateId: number | null; // 映射模板 ID，BigInt
  qrCodeToken: string; // H5 公开入口令牌；业务语义等同 h5EntryToken
  customer: string; // 客户名称
  customerPhone: string | null; // 客户电话，未提供或空字符串入参统一存 NULL
  customerAddress: string; // 客户地址
  totalAmount: string; // 订单总金额，Decimal(12, 2)
  paid: string; // 已收金额，Decimal(12, 2)
  customerFieldValues: any | null; // 动态字段值，Json
  status: OrderStatusEnum; // 订单状态
  payType: OrderPayTypeEnum; // 结算方式
  prints: number; // 打印次数
  lastPrintedAt: string | null; // 最近一次打印成功时间
  printFailedCount: number; // 累计打印失败次数
  lastFailedAt: string | null; // 最近一次打印失败时间
  creditDays: number | null; // 账期天数
  creditDueDate: string | null; // 账期到期日
  orderTime: string; // 下单时间，timestamp(3) 无时区业务时间
  voided: boolean; // 是否已作废
  voidReason: string | null; // 作废原因
  voidedAt: string | null; // 作废时间
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
  deletedAt: string | null; // 软删时间
}
```

关键约束：

- 主键：`id`
- 唯一键：`qrCodeToken`（当前落库字段名；业务语义等同 `h5EntryToken`）
- 手写迁移维护 partial unique：`(tenantId, sourceOrderNo) WHERE deletedAt IS NULL AND sourceOrderNo IS NOT NULL`
- 索引：`(deletedAt, orderTime)`、`(tenantId, deletedAt, orderTime)`、`(tenantId, deletedAt, status, orderTime)`、`(tenantId, deletedAt, payType, creditDueDate)`、`(tenantId, mappingTemplateId)`
- 表名：`orders`
- `mappingTemplateId` 通过复合外键 `(tenantId, mappingTemplateId)` 绑定 `import_templates(tenantId, id)`，避免订单跨租户挂载导入模板
- `prints / lastPrintedAt` 仅在打印成功回执写入时更新
- `printFailedCount / lastFailedAt` 仅在打印失败上报写入时更新
- `orderTime` 来自导入订单的业务下单时间，按 `YYYY-MM-DD HH:mm:ss` 业务原值保存，不参与 UTC 时刻转换
- 订单支付有效期以 `createdAt` 作为订单进入系统时间计算，不以 `orderTime` 计算
- 当前 schema 使用 `deletedAt` 软删

**order_items**

```typescript
{
  id: number; // 行项目 ID，BigInt 自增
  orderId: string; // 所属订单 ID
  skuId: string | null; // 商品主数据 ID
  skuName: string; // 商品名称
  skuSpec: string | null; // 商品规格，表示单件规格，例如 153g
  unit: string; // 单位
  quantity: string; // 数量，Decimal(12, 3)
  packSpec: string | null; // 包装规格，表示销售单位内含，例如 24桶
  unitPrice: string; // 单价，Decimal(12, 2)
  lineAmount: string; // 行金额，Decimal(12, 2)
  customerFieldValues: any | null; // 商品行级动态字段值，Json
}
```

关键约束：

- 主键：`id`
- 索引：`orderId`
- 表名：`order_items`
- `skuSpec / unit / packSpec` 可组合表达包装关系，例如 `1箱 = 153g * 24桶`
- `customerFieldValues` 仅承载导入模板 `type=line` 的商品行级自定义字段值

**order_reminders**

```typescript
{
  id: string                      // 催款记录 ID
  tenantId: string                // 租户 ID
  orderId: string                 // 订单 ID
  operatorId: string | null       // 操作人 ID，UUID
  channels: string[]              // 发送渠道列表
  status: OrderReminderStatusEnum // 发送状态
  sentAt: string                  // 发送时间
  createdAt: string               // 创建时间
}
```

关键约束：

- 主键：`id`
- 索引：`(tenantId, sentAt)`、`(orderId, sentAt)`
- 表名：`order_reminders`

### 4.4 支付域

**tenant_payment_configs**

```typescript
{
  id: string; // 配置记录 ID，UUID
  tenantId: string; // 租户 ID
  channel: PaymentChannelEnum; // 支付通道
  status: TenantPaymentConfigStoredStatusEnum; // 持久化配置状态
  configJson: any; // 渠道专属黑盒配置，Json
  invalidReason: string | null; // 配置无效原因
  lastValidatedAt: string | null; // 最近一次校验时间
  updatedBy: string | null; // 最近更新人
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
}
```

关键约束：

- 主键：`id`
- 唯一键：`(tenantId, channel)`
- 索引：`(status, tenantId)`
- 表名：`tenant_payment_configs`
- `configJson` 为渠道专属黑盒 Json，服务端不在 schema 层解析内部结构
- `status` 只表达该渠道配置本身是否可用，不表达是否当前正在使用
- 当前付款链路实际使用哪个渠道由 `tenants.activePaymentChannel` 单独表达
- API `not_configured` 由“该租户下该渠道无记录”推导，不单独落库
- `shouqianba`、`pingan_bank` 已进入渠道闭集并可保存黑盒配置；线上支付网关接入前不允许作为生效收款渠道

**payments**

```typescript
{
  id: string; // 收款流水 ID
  tenantId: string; // 租户 ID
  orderId: string; // 订单 ID
  customer: string; // 客户名称
  amount: string; // 收款金额，Decimal(12, 2)
  channel: string; // 支付通道编码
  fee: string; // 手续费，Decimal(12, 2)
  net: string; // 到账金额，Decimal(12, 2)
  status: PaymentRecordStatusEnum; // 流水状态
  gatewayTradeNo: string | null; // 第三方交易单号
  paidAt: string; // 支付完成时间
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
}
```

关键约束：

- 主键：`id`
- 唯一键：`gatewayTradeNo`
- 索引：`(tenantId, paidAt)`、`paidAt`、`(channel, paidAt)`、`(status, paidAt)`、`orderId`
- 表名：`payments`

**payment_orders**

```typescript
{
  id: string; // 支付单 ID
  tenantId: string; // 租户 ID
  orderId: string; // 订单 ID
  amount: string; // 本次支付金额，Decimal(12, 2)
  status: PaymentOrderStatusEnum; // 支付单状态
  paymentMethod: PaymentMethodEnum | null; // 支付方式
  channel: PaymentChannelEnum | null; // 实际支付渠道
  statusMessage: string | null; // 状态说明
  offlineRemark: string | null; // 线下支付备注
  cashVerifyStatus: CashVerifyStatusEnum | null; // 现金核销状态
  offlineSubmittedAt: string | null; // 线下支付提交时间
  cashVerifiedAt: string | null; // 现金核销时间
  onlineAttemptNo: number | null; // 线上支付尝试序号，仅 online 支付单使用
  gatewayTradeNo: string | null; // 第三方交易单号
  lastInitiatedAt: string | null; // 最近一次发起支付时间
  cashierUrl: string | null; // 当前收银台继续支付地址
  cashierExpiresAt: string | null; // 后端建单时传给支付网关的收银台有效截止时间
  paidAt: string | null; // 实际支付完成时间
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
}
```

关键约束：

- 主键：`id`
- 唯一键：`gatewayTradeNo`
- 唯一键：`(orderId, paymentMethod, onlineAttemptNo)`
- 索引：`(tenantId, status, updatedAt)`、`(orderId, updatedAt)`
- 表名：`payment_orders`

**payment_webhook_events**

```typescript
{
  id: string; // 回调事件 ID，UUID
  provider: string; // 支付服务商标识，当前为 lakala
  tenantId: string | null; // 关联租户 ID，解析成功后尽量回填
  orderId: string | null; // 关联订单 ID，解析成功后尽量回填
  paymentOrderId: string | null; // 关联支付单 ID，解析成功后尽量回填
  gatewayTradeNo: string | null; // 我方网关交易号
  externalStatus: string | null; // 第三方原始交易状态
  signatureVerified: boolean | null; // 是否验签通过
  processingStatus: PaymentWebhookEventStatusEnum; // 处理结果
  reason: string | null; // 忽略、拒绝或处理成功原因
  rawBody: string | null; // 第三方回调原始报文
  headers: any | null; // 最小请求头快照，Json
  payload: any | null; // 当前版本 JSON 解析结果，Json
  normalized: any | null; // 当前版本归一化字段，Json
  receivedAt: string; // 接收时间
  processedAt: string | null; // 处理完成时间
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
}
```

关键约束：

- 主键：`id`
- 索引：`(provider, receivedAt)`、`(tenantId, receivedAt)`、`(gatewayTradeNo, receivedAt)`、`(paymentOrderId, receivedAt)`、`(orderId, receivedAt)`、`(processingStatus, receivedAt)`
- 表名：`payment_webhook_events`
- 该表只作为支付回调证据链和排障审计记录，不作为订单或支付单状态裁决事实源
- `headers / payload / normalized` 为黑盒 Json 快照，服务端只按当前版本 normalizer 写入，不反向扩展 H5/public 支付能力

### 4.5 公告域

**notices**

```typescript
{
  id: string; // 公告 ID
  title: string; // 公告标题
  content: string; // 公告正文
  planVersion: string | null; // 版本范围
  audience: string | null; // 发布范围
  timing: PublishTimingEnum; // 发布时间类型
  scheduledAt: string | null; // 预约发布时间
  reminder: boolean; // 是否开启提醒
  isDraft: boolean; // 是否草稿
  status: NoticeStatusEnum; // 公告状态
  publishAt: string | null; // 实际发布时间
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
}
```

关键约束：

- 主键：`id`
- 表名：`notices`

**notice_reads**

```typescript
{
  noticeId: string; // 公告 ID
  tenantId: string; // 租户 ID
  userId: string; // 用户 ID，UUID
  isRead: boolean; // 是否已读
  readAt: string | null; // 已读时间
}
```

关键约束：

- 复合主键：`(noticeId, tenantId, userId)`
- 索引：`(tenantId, userId, isRead)`
- 表名：`notice_reads`

### 4.6 编号域

**id_sequences**

```typescript
{
  prefix: string; // 编号前缀
  dateKey: string; // 日期键
  currentVal: number; // 当前序列值，BigInt
}
```

关键约束：

- 复合主键：`(prefix, dateKey)`
- 表名：`id_sequences`

## 5. 同步规则

- 本文不先于 `schema.prisma` 演进。
- 新增、删除、重命名字段或约束后，应在 `schema.prisma` 稳定后再同步本文。
- 如果本文与 `schema.prisma` 冲突，以 `apps/api/prisma/schema.prisma` 为准。
