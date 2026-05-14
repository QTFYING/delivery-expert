# P0 租户创建与首个老板账号施工清单

> 文档状态：已完成，已归档

> 日期：2026-05-08
> 关联设计：`notes/design/p0-tenant-owner-bootstrap-design.md`
> 适用范围：仅覆盖“Admin 创建租户并自动生成首个 TENANT_OWNER”，不含拉卡拉自主进件与支付配置实现。

## 1. 施工目标

把当前“创建租户”和“创建首个老板账号”两条分离链路，收敛为一条可落地的 P0 流程：

1. Admin 创建租户
2. 系统自动生成 `tenantId`
3. 系统自动创建首个 `TENANT_OWNER`
4. 该老板账号可在 `ONBOARDING` 状态下登录 Tenant 端完成初始化配置

## 2. 已确认规则

- 不改 Prisma 表结构
- `tenantId` 继续由服务端生成
- `POST /tenants` 作为唯一创建入口
- 租户创建后状态保持 `ONBOARDING`
- `ONBOARDING` 状态下，仅 `TENANT_OWNER` 可登录 Tenant 端
- `ONBOARDING` 状态下，其他租户角色不可登录
- 不允许删除或禁用某租户最后一个老板账号

## 3. 章节清单

### T01 创建租户契约扩字段

本步改什么：

- 为 `POST /tenants` 增加首个老板账号字段
- 保持现有 `tenantId` 生成方式不变
- 明确 `admin` 继续表示老板姓名，`ownerAccount` 表示登录账号

本步不改什么：

- 不改 Prisma schema
- 不改认证逻辑
- 不改创建租户事务

建议落点：

- `packages/types/src/contracts/tenant.ts`
- `apps/api/src/tenant/dto/create-os-tenant.dto.ts`
- `docs/api/admin-api-doc.md`
- 如有对应 Swagger DTO 展示文件，一并同步

建议新增字段：

- `ownerAccount`
- `ownerPhone`
- `ownerInitialPassword`

字段规则：

- `ownerAccount` 必填，全局唯一
- `ownerPhone` 建议必填
- `ownerInitialPassword` 可选，未传则回退系统默认密码

完成标准：

- `CreateTenantRequest` 与 DTO 对齐
- Admin API 文档明确“创建租户时同步创建首个老板账号”

最小验证：

- `pnpm -F api build`

### T02 创建租户事务化生成首个老板账号

本步改什么：

- 把 `createAdminTenant()` 改成单事务动作
- 在创建租户后立即创建首个 `TENANT_OWNER`
- 失败时整体回滚

本步不改什么：

- 不改登录门禁
- 不改 Tenant 侧员工管理接口
- 不改支付配置逻辑

建议落点：

- `apps/api/src/tenant/os-tenant-lifecycle.service.ts`
- 如需复用校验逻辑，可抽取或复用：
  - `apps/api/src/tenant/os-user.service.ts`
  - `apps/api/src/tenant/tenant.shared.ts`

事务步骤：

1. 校验租户基础字段
2. 校验 `ownerAccount` 可用
3. 生成 `tenantId`
4. 创建 `tenants`
5. 创建 `users(role=TENANT_OWNER)`
6. 写审计日志
7. 返回租户结果

用户默认写入规则：

- `realName = admin`
- `account = ownerAccount`
- `phone = ownerPhone`
- `role = TENANT_OWNER`
- `status = ACTIVE`
- `scope = 'tenant'`
- `requiresPasswordReset = true`

完成标准：

- 创建租户成功时，同时存在租户记录和首个老板账号
- 账号冲突时，租户和用户都不落库
- 不出现半成功状态

最小验证：

- `pnpm -F api build`
- 手工创建租户，确认数据库中 `tenants` 与 `users` 同时写入

### T03 认证放开 ONBOARDING 老板初始化登录

本步改什么：

- 调整认证侧可登录规则
- 允许 `ONBOARDING + TENANT_OWNER` 登录 Tenant 端
- 保持 `ONBOARDING` 下其他租户角色仍不可登录

本步不改什么：

- 不把 `ONBOARDING` 视为正式开通
- 不放开 Admin 端登录
- 不放开 H5 支付能力

建议落点：

- `apps/api/src/auth/auth.service.ts`
- 如有必要，补充认证文档或 Swagger 说明

行为规则：

- `tenant.status = ACTIVE`：按现有租户角色登录规则执行
- `tenant.status = ONBOARDING`：
  - `TENANT_OWNER` 允许登录 Tenant 端
  - `TENANT_OPERATOR` / `TENANT_FINANCE` / `TENANT_VIEWER` 不允许登录
- `tenant.status = PAUSED`：仍不可登录

完成标准：

- 新创建租户的老板账号可以登录 Tenant 端
- 同租户其他角色在 `ONBOARDING` 下无法登录
- 登录放开不影响平台账号登录逻辑

最小验证：

- `pnpm -F api build`
- 手工验证：
  - 新建租户老板账号可登录
  - `ONBOARDING` 租户下非老板账号不可登录

### T04 最后一个老板账号保护

本步改什么：

- 在租户用户删除、禁用链路增加保护
- 防止租户失去最后一个可用老板账号

本步不改什么：

- 不改变现有普通员工账号管理模型
- 不增加新的用户角色

建议落点：

- `apps/api/src/settings/settings-user.service.ts`
- 如平台侧允许直接改租户用户，也同步检查平台侧用户管理逻辑

保护规则：

- 不允许删除某租户最后一个未删除的 `TENANT_OWNER`
- 不允许禁用某租户最后一个 `ACTIVE` 的 `TENANT_OWNER`
- 若该租户还有其他老板账号，则允许正常删除或禁用

完成标准：

- 租户始终至少保留一个可用老板入口
- 错误提示清晰，能说明失败原因

最小验证：

- `pnpm -F api build`
- 手工验证：
  - 单老板租户删除失败
  - 单老板租户禁用失败
  - 双老板租户可删除或禁用其中一个

### T05 文档、Swagger 与联调收口

本步改什么：

- 同步 Admin API 文档
- 同步必要的 Swagger 展示
- 对齐租户初始化与登录门禁说明

本步不改什么：

- 不新增数据库迁移
- 不实现拉卡拉支付配置逻辑

建议落点：

- `docs/api/admin-api-doc.md`
- 如涉及 Tenant 登录说明，再同步 `docs/api/tenant-api-doc.md`
- 相关 Swagger DTO / 注解文件

应补充说明的文档点：

- 创建租户时同步生成首个老板账号
- 老板账号首次登录改密
- `ONBOARDING` 下仅老板可登录 Tenant 端
- 本阶段还未打通支付配置，不等于已可收款

完成标准：

- 文档、DTO、实现语义一致
- 没有“老板账号创建了但文档没写”这类漂移

最小验证：

- `pnpm -F api build`
- 如项目常规要求允许，再执行：
  - `pnpm -F api test:smoke`

## 4. 推荐实施顺序

按以下顺序推进：

1. `T01` 扩契约与 DTO
2. `T02` 做创建事务
3. `T03` 放开初始化登录
4. `T04` 补最后一个老板账号保护
5. `T05` 文档与联调收口

原因：

- 先定请求结构，再改事务实现，避免前后端字段反复改
- 登录门禁要放在老板账号真正能创建之后验证
- 最后一个老板保护应在账号链路通了之后补上

## 5. 每章边界约束

- 每次只做一个 `T0X`
- 不顺手把租户支付配置一起做掉
- 不顺手把自主进件一起做掉
- 不顺手把用户邀请、短信激活一起做掉
- 每章完成后至少跑一次 `pnpm -F api build`

## 6. 验收清单

- Admin 创建租户时，提交一次请求即可完成租户与首个老板账号创建
- `tenantId` 仍由服务端生成
- 老板账号默认要求首次改密
- `ONBOARDING` 下老板可登录 Tenant 端
- `ONBOARDING` 下其他租户角色不可登录
- 删除或禁用最后一个老板账号会被阻止
- 本期未改 Prisma schema

## 7. 后续衔接

本施工清单完成后，下一阶段再进入“租户收单配置”：

1. 老板登录 Tenant 端
2. 配置拉卡拉商户号等资料
3. 配置校验
4. 启用租户支付渠道
5. H5 按租户配置发起支付

这部分不属于本施工清单范围。
