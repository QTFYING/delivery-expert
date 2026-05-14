# P0 租户创建与首个老板账号引导设计

> 文档状态：已完成，已归档

> 日期：2026-05-08
> 适用范围：P0 阶段
> 目标：在不改 Prisma 表结构的前提下，支持 Admin 创建租户时自动生成首个 `TENANT_OWNER` 账号，并为后续 Tenant 端拉卡拉收单配置打通登录前提。

## 1. 背景与当前现状

当前项目已经具备：

- `tenants` 租户主体表
- `users` 用户表，支持 `tenantId` 关联租户
- `TENANT_OWNER` / `TENANT_OPERATOR` / `TENANT_FINANCE` / `TENANT_VIEWER` 角色体系
- Tenant 侧员工管理能力
- `tenant_payment_configs` 与 `tenants.activePaymentChannel`，可承接后续租户收单配置

当前项目尚未具备：

- Admin 创建租户时同步生成首个可登录的租户老板账号
- 创建租户后自动把“谁来首次登录 Tenant 端配置收单资料”收口到标准流程

当前代码现状：

- `createAdminTenant()` 只创建租户，不创建用户
- `createAdminUser()` 已支持平台侧创建租户用户，但当前是独立接口
- 登录态要求：租户用户只有在 `user.status = ACTIVE` 且 `tenant.status = ACTIVE` 时才允许登录

这意味着，如果继续保持“先建租户、再人工去另一个入口建老板账号”，会出现以下问题：

- 容易漏配首个老板账号，导致租户无法进入 Tenant 端
- 流程被拆成两步，运营成本高
- 中间失败时容易产生“租户存在但无人可登录”的孤儿状态

## 2. P0 目标与非目标

### 2.1 P0 目标

- 保持 `tenantId` 继续由服务端生成，不接受前端自定义
- Admin 创建租户时，在同一业务流程中同步创建首个 `TENANT_OWNER`
- 首个老板账号创建成功后，可用于后续登录 Tenant 端完成收单配置
- 不改 Prisma schema，只改接口、事务流程、校验与审计

### 2.2 P0 非目标

- 不做拉卡拉自主进件
- 不做租户自注册
- 不做邀请链接、短信激活、邮件激活
- 不做“创建用户时反向自动建租户”
- 不做密钥托管方案升级

## 3. 设计原则

- 租户是主体，用户是租户成员，流程必须是“先建租户，再挂首个老板账号”
- `tenant.adminName` 继续只做展示快照，不承担登录账号语义
- `users` 表继续承载全部登录账号，不在 `tenants` 表重复存账号字段
- 创建租户与创建首个老板账号必须在同一事务内完成
- 平台侧跨租户能力必须显式，Tenant 侧不得自行指定 `tenantId`

## 4. 数据模型结论

P0 不改 Prisma 表结构。

直接复用现有模型：

- `tenants`
  - `id`：服务端生成
  - `adminName`：老板姓名展示字段
  - `status`：当前创建后仍按现有业务进入 `ONBOARDING`
- `users`
  - `tenantId`：关联新建租户
  - `role`：固定为 `TENANT_OWNER`
  - `status`：固定为 `ACTIVE`
  - `requiresPasswordReset`：固定为 `true`

不新增以下字段：

- `tenants.ownerAccount`
- `tenants.ownerPhone`
- `tenants.ownerUserId`

原因：

- 这些信息都能从 `users` 表得到
- P0 增加这些字段会制造重复来源和同步成本
- 当前阶段没有必要为了“首个老板账号”改表

## 5. 接口改造方案

### 5.1 主方案

保持 `POST /tenants` 作为 Admin 创建租户的唯一入口，但把“首个老板账号”字段并入该请求。

推荐请求体扩展为：

```json
{
  "name": "华南一区商户A",
  "packageName": "标准版",
  "admin": "张三",
  "region": "广东深圳",
  "channel": "lakala",
  "dueInDays": 30,
  "ownerAccount": "tenant_a_boss",
  "ownerPhone": "13800138000",
  "ownerInitialPassword": "123456"
}
```

字段语义：

- `admin`
  - 保持现有语义，表示老板姓名
  - 后端继续回写到 `tenant.adminName`
- `ownerAccount`
  - 首个老板登录账号
  - 全局唯一
- `ownerPhone`
  - 首个老板手机号
  - P0 建议必填，便于后续联系与校验
- `ownerInitialPassword`
  - 初始密码
  - P0 可允许不传；不传则回退为系统默认密码，并强制首次改密

### 5.2 响应方案

P0 可先保持 `TenantRecordItem` 不变，减少联动范围。

首个老板账号信息不强制进入 `POST /tenants` 响应体；前端只要知道租户创建成功即可。若运营侧需要当场展示初始账号，可通过以下二选一策略实现：

- 策略 A：`POST /tenants` 额外返回一个扩展响应，包含 `ownerAccount` 与 `requiresPasswordReset`
- 策略 B：保持当前响应不变，Admin 前端在创建成功后跳到用户列表按租户筛出该老板账号

P0 推荐先用策略 A，但若考虑联动最小，也可先用策略 B。

## 6. 后端事务设计

`POST /tenants` 后端服务改造为单事务动作：

1. 校验租户请求基础字段
2. 校验 `ownerAccount` 是否可用
3. 生成 `tenantId`
4. 创建 `tenants` 记录
5. 创建首个 `users` 记录
6. 写入租户审计日志与账号审计日志
7. 返回租户创建结果

事务内用户写入规则：

- `tenantId = 新生成的 tenantId`
- `account = ownerAccount`
- `phone = ownerPhone`
- `realName = admin`
- `role = TENANT_OWNER`
- `scope = 'tenant'`
- `status = ACTIVE`
- `requiresPasswordReset = true`
- `passwordHash = ownerInitialPassword` 对应的 bcrypt 结果；若未传则使用系统默认密码

失败回滚规则：

- 账号唯一冲突时，整个租户创建失败
- 密码哈希、用户写入、审计写入任一步失败时，整个租户创建失败
- 不允许落地“tenant 已创建但 owner 未创建”的半完成状态

## 7. 权限与状态规则

### 7.1 创建权限

- 仅 `OS_SUPER_ADMIN` 可以创建租户并生成首个老板账号

### 7.2 登录门禁

按当前登录实现，租户用户只有在以下条件同时满足时可登录：

- `user.status = ACTIVE`
- `tenant.status = ACTIVE`
- 用户与租户都未删除

P0 已确认规则：

- 保持租户创建后状态仍为 `ONBOARDING`
- 允许 `ONBOARDING` 状态下的 `TENANT_OWNER` 登录 **Tenant 端**
- `ONBOARDING` 状态下的 `TENANT_OWNER` 不允许进入 Admin 端
- `ONBOARDING` 状态下的 `TENANT_OPERATOR`、`TENANT_FINANCE`、`TENANT_VIEWER` 仍不允许登录

这条规则的业务含义是：

- 平台创建好租户和首个老板账号后，老板可以立刻进入 Tenant 端做初始化配置
- 初始化配置包括租户基础资料、员工账号、支付渠道配置等准备动作
- 这不等于租户已经正式开通全部业务能力

需要同时明确的边界：

- `ONBOARDING + TENANT_OWNER` 允许登录，只是为了完成初始化
- H5 在线支付是否可用，仍然单独受支付配置状态控制
- 即使老板能登录 Tenant 端，只要支付配置未完成，线上收款仍不能放行

因此认证侧需要按以下规则调整：

- `tenant.status = ACTIVE` 时，所有正常租户角色按现有规则登录
- `tenant.status = ONBOARDING` 时，仅 `TENANT_OWNER` 允许登录 Tenant 端
- 其他租户状态如 `PAUSED` 仍按不可登录处理

### 7.3 首个老板账号保护

P0 需要新增两个保护规则：

- 不允许删除某租户最后一个未删除的 `TENANT_OWNER`
- 不允许禁用某租户最后一个 `ACTIVE` 的 `TENANT_OWNER`

原因：

- 否则租户会再次进入“无人可登录”的状态

## 8. Admin 端表单设计

Admin 创建租户表单建议拆成两组：

### 8.1 租户主体信息

- `name`
- `packageName`
- `admin`
- `region`
- `channel`
- `dueInDays`

### 8.2 首个老板账号信息

- `ownerAccount`
- `ownerPhone`
- `ownerInitialPassword`

前端交互建议：

- 若不填 `ownerInitialPassword`，界面明确提示将使用系统默认初始密码，并要求首次改密
- 创建成功后明确展示：
  - 租户名称
  - 租户 ID
  - 老板登录账号
  - 是否要求首次改密

P0 不要求：

- 账号邀请链接
- 短信验证码
- 密码复杂度强规则页面提示

## 9. 与 Tenant 收单配置的衔接

本方案是“租户收单配置”前置条件，不替代收单配置本身。

完整链路应为：

1. Admin 创建租户
2. 系统自动生成首个 `TENANT_OWNER`
3. 老板登录 Tenant 端
4. 老板进入支付配置页面维护拉卡拉商户资料
5. 配置校验通过后，租户支付渠道可进入可用态
6. H5 支付按租户自己的配置发起

因此本方案完成后，只解决：

- 谁能进入 Tenant 端做配置

不解决：

- 租户支付配置数据如何保存
- 拉卡拉配置如何校验
- H5 如何按租户配置发起支付

这些继续由既有 `tenant_payment_configs` 方案承接。

## 10. 代码落点建议

### 10.1 后端

- `apps/api/src/tenant/dto/create-os-tenant.dto.ts`
  - 扩展首个老板账号字段
- `packages/types/src/contracts/tenant.ts`
  - 扩展 `CreateTenantRequest`
- `apps/api/src/tenant/os-tenant-lifecycle.service.ts`
  - 把创建租户改为“租户 + 首个老板账号”的事务动作
- `apps/api/src/tenant/os-user.service.ts`
  - 复用账号唯一校验逻辑，避免重复实现
- `apps/api/src/auth/auth.service.ts`
  - 若采用推荐方案，放开 `ONBOARDING + TENANT_OWNER` 登录门禁
- `docs/api/admin-api-doc.md`
  - 同步创建租户请求语义

### 10.2 前端

- Admin 创建租户表单
- Admin 创建成功后的结果提示

Tenant 端不需要为本方案新增页面。

## 11. 校验规则明细

### 11.1 请求字段校验

- `name`：必填，长度不超过 100
- `packageName`：必填，长度不超过 100
- `admin`：必填，长度不超过 50
- `region`：必填，长度不超过 100
- `channel`：P0 继续只允许现有闭集值
- `dueInDays`：必填，正整数
- `ownerAccount`：必填，长度不超过 50，全局唯一
- `ownerPhone`：建议必填，长度不超过 20
- `ownerInitialPassword`：可选；若传入则按最小长度校验

### 11.2 业务校验

- `ownerAccount` 不能与现有未删除用户重复
- `ownerPhone` 可不做唯一约束，但至少做格式清洗
- 创建成功后必须存在一条：
  - `tenantId = 新租户ID`
  - `role = TENANT_OWNER`
  - `deletedAt = null`

## 12. 审计要求

P0 建议拆成两条审计记录：

- `创建租户`
- `创建租户首个老板账号`

这样后续排查时可以明确区分：

- 是租户主体创建动作
- 还是账号引导动作

若当前审计体系不想拆两条，也至少要在“创建租户”日志里记录：

- 新租户 ID
- 首个老板账号

## 13. 验收点

- Admin 创建租户后，数据库中同时出现：
  - 一条 `tenants`
  - 一条 `users(role=TENANT_OWNER)`
- `tenantId` 仍由服务端生成
- `ownerAccount` 冲突时，租户与账号都不落库
- 首个老板账号默认要求首次改密
- 不允许删除或禁用最后一个 `TENANT_OWNER`
- `ONBOARDING` 状态下的 `TENANT_OWNER` 可以登录 Tenant 端
- `ONBOARDING` 状态下其他租户角色不能登录
- 后续 Tenant 支付配置链路可以直接使用该老板账号登录

## 14. 风险与后续事项

### 14.1 P0 主要风险

- 若不处理认证门禁，`ONBOARDING` 租户仍无法登录 Tenant 端
- 若不做“最后一个老板账号保护”，后续仍可能把租户操作入口删空
- 若 `POST /tenants` 只改前端不改事务，仍可能出现半成功状态

### 14.2 P1 以后可继续演进

- 邀请制创建首个老板账号
- 短信 / 邮件激活
- 初始密码随机生成并一次性展示
- `primaryOwnerUserId` 显式建模
- 租户自注册与平台审核流衔接
- 收单配置、进件、审核结果回填统一链路

## 15. 最终结论

P0 最稳妥的落地方式是：

- 不改 Prisma 表结构
- 继续由服务端生成 `tenantId`
- 由 `POST /tenants` 统一承接“创建租户 + 创建首个 `TENANT_OWNER`”
- 用事务保证一致性
- 让该老板账号成为后续 Tenant 收单配置的入口账号

这样可以在最小改动下，先把“谁来进入 Tenant 端完成支付配置”这件事真正打通。
