# 租户支付渠道配置后续计划

> 日期：2026-05-08
> 文档状态：已完成，已归档
> 文档定位：非事实源施工清单
> 适用范围：`apps/api/src/settings`、`apps/api/src/tenant`、`apps/api/src/payment`
> 事实源：`docs/api/admin-api-doc.md`、`docs/api/tenant-api-doc.md`、`docs/api/h5-api-doc.md`、`docs/api/api-architecture-overview.md`、`packages/types/src/enums`、`packages/types/src/contracts`、`docs/prisma/data-model-reference.md`、`apps/api/prisma/schema.prisma`

## 1. 稳定结论

这条主线已经从“单拉卡拉配置”升级为“租户支付渠道配置”。`docs/api` 目录只保留权威语义，本主题的阶段性方案、落地顺序和剩余事项统一留在本文，不再单独维护 `docs/api/tenant-lakala-payment-config.md`。

当前已稳定的业务结论如下：

1. P0 不做拉卡拉自主进件，项目级生产签名参数继续放 `.env`
2. 租户支付配置按“多渠道配置 + 单一当前生效渠道”建模，当前闭集先只开放 `lakala`
3. 接口资源统一使用 `payment-configs`，`channel` 是正式资源标识，不再把 `lakala` 写死在接口名里
4. 同一租户可以维护多套渠道配置，但任一时刻只能有一个 `activePaymentChannel`
5. 渠道专属参数统一放 `configJson`；P0 的 `lakala` 配置仍只包含 `merchantNo`、`terminalNo`
6. H5 在线支付门禁必须同时满足：订单本身允许支付、`tenant.activePaymentChannel` 已设置、当前生效渠道配置状态为 `available`
7. Tenant / Admin 页面都不展示 `APP_ID`、`SERIAL_NO`、`PRIVATE_KEY`、`PUBLIC_KEY`、`NOTIFY_URL`

## 2. 当前进度

截至 2026-05-08，本主线已完成：

1. 权威文档、共享 enums、contracts、Swagger、Prisma 建模已对齐“多渠道配置 + 单一当前生效渠道”语义
2. `tenant_payment_configs` 与 `tenants.activePaymentChannel` 已进入 `schema.prisma`
3. Tenant 侧支付渠道配置接口已落地到 `SettingsPaymentConfigService` 与 `SettingsController`
4. Tenant 侧已支持：
   - `GET /settings/payment-configs`
   - `GET /settings/payment-configs/{channel}`
   - `PUT /settings/payment-configs/{channel}`
   - `POST /settings/payment-configs/{channel}/validate`
   - `POST /settings/payment-configs/{channel}/disable`
   - `POST /settings/payment-configs/{channel}/activate`
5. Admin 侧已支持：
   - `GET /tenants/payment-configs`
   - `GET /tenants/{id}/payment-configs/{channel}`
   - `POST /tenants/{id}/payment-configs/{channel}/validate`
   - `POST /tenants/{id}/payment-configs/{channel}/disable`
   - `POST /tenants/{id}/payment-configs/{channel}/activate`
6. H5 发起支付、详情与状态查询已统一依赖 `tenant.activePaymentChannel` 与当前生效渠道配置状态
7. 支付发起链路已按当前生效渠道选择 provider，`payment_orders.channel` 不再在主链路里手写固定 `LAKALA`
8. Tenant / Admin 两侧支付渠道配置动作已补审计日志

当前剩余事项：

1. 如后续新增 `shouqianba` 等新渠道，需要在闭集、provider、webhook 与配置校验层按本主线继续扩展
2. 现有 `test:backend-regression` 命中一条与本主线无关的既有失败，见下方验证记录

## 3. 剩余章节

### T04-4 Admin 侧查询与兜底动作

目标：

- 接通平台侧列表、详情与兜底操作

建议范围：

- `apps/api/src/tenant/os-tenant.controller.ts`
- 新增 `apps/api/src/tenant/os-tenant-payment-config.service.ts`
- 复用 `apps/api/src/settings/mapping/payment-config.mapper.ts`

完成标准：

- 平台侧可读取租户支付渠道配置列表与详情
- 平台侧可执行 `validate / disable / activate`
- Admin 与 Tenant 共用同一套状态语义

### T04-5 H5 门禁与渠道路由

目标：

- H5 在线支付真正依赖当前生效渠道

建议范围：

- `apps/api/src/payment/payment-initiation.service.ts`
- `apps/api/src/payment/gateway/payment-gateway.registry.ts`
- 必要时补 `docs/api/h5-api-doc.md`

完成标准：

- 发起支付前先读取 `tenant.activePaymentChannel`
- 对应配置不存在、未校验通过、已停用时，阻断建单
- `payment_orders.channel` 取当前生效渠道，而不是继续写死 `LAKALA`

### T04-6 审计、验证与联调收口

目标：

- 把本主线从“结构对齐”推进到“可验收”

建议范围：

- Tenant / Admin 的支付渠道配置动作补审计
- 最小 smoke / regression
- 构建、冒烟、联调记录

完成标准：

1. `pnpm -F api build`
2. `pnpm -F api test:smoke`
3. 如有对应入口，再补 `pnpm -F api test:backend-regression`
4. Tenant / Admin / H5 三侧语义一致

执行结果：

1. `pnpm -F api build`
   - 已通过
2. `pnpm -F api test:smoke`
   - 已通过
3. `pnpm -F api test:backend-regression`
   - 已执行
   - 命中既有失败：`Tenant Print Records`
   - 失败请求为 `GET /api/orders/print-records?result=failed`
   - 实际返回 `404` 与业务体 `code=4004 message=订单不存在`
   - 该失败落在订单打印追溯链路，不在本次支付渠道配置改动面内
4. 旧口径复核
   - 已确认 `docs/api`、`apps/api/src`、`packages/types/src` 中无 `settings/payment/lakala`、`payment-config/lakala`、`/enable`、`当前租户拉卡拉收单配置不可用` 等残留
5. 联调结论
   - Tenant / Admin / H5 三侧已统一为“多渠道配置 + 单一当前生效渠道”语义
   - H5 在线支付门禁已统一为“订单可支付 + 已设置 `activePaymentChannel` + 当前生效渠道配置状态为 `available`”

## 4. 保留原则

1. 本文档是当前唯一保留的“租户支付渠道配置”施工主线
2. `notes/handoffs/*` 不再重复保留同主题阶段性交接稿
3. 若本主线全部完成，应将本文转入归档目录
