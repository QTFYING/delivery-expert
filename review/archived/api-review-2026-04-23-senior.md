# API 项目 Senior Review（2026-04-24 · 全量代码复核版）

> 文档状态：历史评审稿，已归档

> 覆盖范围：`apps/api/src` + `packages/types/src` 共 169 个源码文件，`apps/api/prisma` 2 个文件，以及 `apps/api/package.json`
> 事实源顺序：`docs/api/*.md` -> `packages/types/src/enums` -> `packages/types/src/contracts` -> `apps/api/prisma/schema.prisma` -> `apps/api`
> 说明：本版用于替换 2026-04-23 夜间版结论；本轮为全量代码复核，不是重点模块抽样；未执行 build / smoke / regression

## 一、应从昨晚版移除的结论

### R1. “拉卡拉 webhook 完全无验签”已不成立

**位置**

- `apps/api/src/main.ts:14-37`
- `apps/api/src/payment/gateway/lakala.adapter.ts:75-107`
- `apps/api/src/payment/payment-webhook.service.ts:40-49`

**现状**

- 主进程已为 `/api/payment/webhook/lakala` 保留 `rawBody`
- webhook 已解析 `Authorization`
- 已使用拉卡拉公钥做 `RSA-SHA256` 验签
- 验签失败会直接拒绝请求

旧报告里“任意人可直接伪造成功回调入账”的表述，已不再符合当前源码。

### R2. “空 `gatewayTradeNo` 可绕过去重”已不成立

**位置**

- `apps/api/src/payment/payment-webhook.service.ts:62-65`

**现状**

缺失 `gatewayTradeNo` 时已经直接抛 `BadRequestException`，不会再进入后续入账流程。

### R3. “Webhook 金额单位未确认 / 直接按元处理”已不成立

**位置**

- `apps/api/src/payment/gateway/lakala.adapter.ts:109-120`

**现状**

`parseLakalaAmount()` 已明确按“分”解析，再 `div(100)` 转成元。

### R4. “当前金额序列化成 JS number 必然越界”不应继续作为高优先级问题

**位置**

- `apps/api/prisma/schema.prisma:296-297`
- `apps/api/prisma/schema.prisma:353-356`

**现状**

当前金额字段统一是 `Decimal(12,2)`。在这个边界内，把金额投影成 JS `number` 不是当前实现里的直接 bug。是否改成字符串金额，属于接口契约取舍，不是本轮最值得优先处理的问题。

---

## 二、Blocker

### B1. 过期支付单的晚到成功回调仍会重复入账

**位置**

- `apps/api/src/payment/payment-query.service.ts:233-247`
- `apps/api/src/payment/payment-webhook.service.ts:67-156`

**现状**

- `expireIfNeeded()` 会把超时支付单更新为 `EXPIRED`
- webhook 处理只排除了 `PAID`
- 只要旧 `gatewayTradeNo` 的成功回调晚到，当前实现仍会：
  - 命中旧 `paymentOrder`
  - 新增一条 `payment`
  - 再次累加 `orders.paid`

**事故场景**

1. 用户发起支付单 A，超时后被系统标记为 `EXPIRED`
2. 用户重新发起支付单 B，并完成付款
3. 网关稍后才把 A 的成功回调推来
4. 当前实现会把 A 再记一笔，导致订单实收超额、流水重复

**建议**

- webhook 只接受 `PAYING -> PAID` 的单向迁移
- `EXPIRED` / `UNPAID` 的成功回调只记审计日志，不再入账
- 入账前再校验订单剩余应付金额，而不是只校验 `paymentOrder.amount`

### B2. 账期单仍会被 H5 支付主链路当作可支付订单

**位置**

- `apps/api/src/order/order.domain.ts:5-18`
- `apps/api/src/order/order.service.ts:160-162`
- `apps/api/src/payment/payment.domain.ts:27-64`
- `apps/api/src/payment/payment-operation.service.ts:57-126`
- `apps/api/src/payment/payment-operation.service.ts:128-219`
- `apps/api/src/import/import-job-runner.service.ts:536-580`
- `docs/api/h5-api-doc.md:126-127`
- `docs/api/h5-api-doc.md:271-277`
- `docs/api/tenant-api-doc.md:2078`

**现状**

- 订单域本身已经定义：`payType = credit` 时，订单状态应为 `credit`
- 手工建单入口也确实按这个规则写入
- 但 H5 状态推导 `resolvePaymentOrderStatus()` 并没有把 `credit` 排除出可支付态；只要订单未付清、又没有 `paymentOrder`，就会回 `unpaid`
- `initiatePayment()` 与 `submitOfflinePayment()` 也没有按 `payType` 拦截账期单
- 更严重的是，导入链路在创建 / 覆盖订单时把 `status` 固定写成 `PENDING`，即使 `payType = credit`

**影响**

- 账期单在 H5 端可能显示为“待支付”
- 客户可能对本应按账期结算的订单发起在线支付或登记线下支付
- 导入账期单会比手工账期单更容易落入错误状态，进一步扩大 H5 误导

**建议**

- H5 状态推导必须把 `payType = credit` 显式排除出可支付路径
- `POST /pay/:token/initiate` 与 `POST /pay/:token/offline-payment` 需要按 `payType` 拒绝账期单
- 导入创建 / 覆盖订单时必须复用统一的订单状态推导规则，而不是硬编码 `PENDING`

### B3. 默认密码 `123456` 仍在主流程里，且 `requiresPasswordReset` / `loginAt` 没有闭环

**位置**

- `apps/api/prisma/schema.prisma:163-177`
- `apps/api/src/tenant/tenant-admin-user.service.ts:39`
- `apps/api/src/tenant/tenant-admin-user.service.ts:103-114`
- `apps/api/src/tenant/tenant-admin-user.service.ts:232-237`
- `apps/api/src/settings/settings-user.service.ts:27`
- `apps/api/src/settings/settings-user.service.ts:142-156`
- `apps/api/src/auth/auth.service.ts:31-57`
- `apps/api/src/auth/auth.service.ts:116-189`
- `apps/api/src/settings/mapping/settings.mapper.ts:15-32`
- `apps/api/src/platform/platform-overview.service.ts:148-175`

**现状**

- 平台用户创建默认密码仍是 `123456`
- 平台侧重置密码未传值时仍回落到 `123456`
- 租户用户创建未传密码时也默认 `123456`
- `requiresPasswordReset` 只在创建 / 重置时写入，认证链路不消费，密码修改后也没有清除闭环
- `loginAt` 被用户列表和平台健康度逻辑读取，但登录链路没有写入

**影响**

- “默认密码 + 手机号即账号”会把租户侧账号暴露成长期风险
- `requiresPasswordReset` 给人一种“已治理”的错觉，但实际上没有约束力
- 平台概览里基于 `loginAt` 的活跃度判断也会失真

**建议**

- 改成随机临时密码或一次性邀请链接
- 登录成功后如果 `requiresPasswordReset = true`，必须强制进入改密流程
- 密码修改成功后清除 `requiresPasswordReset`
- 登录成功时补记 `loginAt`

---

## 三、Major

### M1. 导入一致性约束被实现成“同用户串行”，没有落实“同租户单活动任务”

**位置**

- `review/plans/import-revamp-plan.md:20`
- `review/plans/import-revamp-plan.md:83`
- `apps/api/src/import/import.service.ts:66-96`
- `apps/api/src/import/import.service.ts:99-147`
- `apps/api/src/import/import-job-runner.service.ts:121-165`

**现状**

- 规范要求：同一租户同一时刻最多只允许 1 个 `pending / processing` 导入任务
- 当前实现只按 `tenantId + userId` 维护 Redis 活动任务态
- 这意味着不同用户可以在同一租户内同时各自持有一个活动导入任务

`importRevision` 只能兜住旧预检快照失效，不能替代“租户级单活动任务”约束。

### M2. `RolesGuard` 仍是 default-allow，且 `AppModule` 没有全局 `APP_GUARD`

**位置**

- `apps/api/src/auth/guards/roles.guard.ts:10-27`
- `apps/api/src/app.module.ts:18-37`

**现状**

- 没有 `@Roles()` 的 handler 会直接放行
- 全局也没有统一接入 `JwtAuthGuard` / `RolesGuard`

这会把未来新增接口时“漏挂 guard / 漏写 roles”放大成真实权限事故窗口。

### M3. 手工建单接口仍无幂等键，客户端重试会重复开单

**位置**

- `apps/api/src/order/order.service.ts:152-186`

**现状**

`createOrder()` 仍然是“收到请求 -> 生成订单号 -> 直接落库”。请求体里没有 `requestId` / `idempotencyKey`，数据库也没有对应唯一约束。

### M4. 创建催款提醒只写记录，不会真正触发通知渠道

**位置**

- `docs/api/tenant-api-doc.md:1028-1034`
- `apps/api/src/order/order-finance.service.ts:65-108`
- `apps/api/src/notification/notification.service.ts:13-96`

**现状**

- 文档语义是：创建催款提醒记录，并触发对应通知渠道
- 当前实现只写了 `order_reminders` 和 `audit_logs`
- 代码里没有任何短信、微信、站内通知或通知派发调用

这已经不是“以后可以增强”的问题，而是接口行为与事实源不一致。

### M5. 登录 / H5 / webhook 公开端点仍无限流

**位置**

- `apps/api/src/auth/auth.controller.ts:31-65`
- `apps/api/src/payment/payment.controller.ts:68-166`
- `apps/api/package.json:21-45`

**现状**

当前以下端点都对公网开放，且依赖里没有 `@nestjs/throttler`：

- `/auth/login`
- `/auth/refresh`
- `GET /pay/:token`
- `POST /pay/:token/initiate`
- `POST /pay/:token/offline-payment`
- `GET /pay/:token/status`
- `POST /payment/webhook/lakala`

### M6. 报表与平台/财务对账仍有大范围内存聚合

**位置**

- `apps/api/src/report/report.service.ts:18-97`
- `apps/api/src/finance/finance.service.ts:119-205`

**现状**

- `ReportService.getDailyTrend()` / `getMonthlyTrend()` 是 `findMany()` 拉全量后在 Node 侧 `filter + reduce`
- `FinanceService.getAdminSummary()` / `getAdminDaily()` 也有明显的应用层聚合

当前体量下未必立刻出事故，但它已经是明确的扩容瓶颈。

---

## 四、Minor

### Mi1. `PaymentLedgerService.applyOrderPaidAmount()` 仍是 read-modify-write，账期回款逻辑也已与账务 helper 分叉

**位置**

- `apps/api/src/payment/payment-ledger.service.ts:91-126`
- `apps/api/src/order/order-finance.service.ts:197-247`

**现状**

- 共享账务 helper 仍然是“读旧值 -> 内存计算 -> 整值回写”
- 账期回款又在 `OrderFinanceService.createReceipt()` 内部手工复制了一套 payment + order 更新逻辑

这不是当前最直接的资金事故源，但后续只要继续增加支付来源或并发场景，就很容易再次演变成状态机漂移。

### Mi2. 导入 runner 的 stale / lock 窗口仍偏短，续锁失败被静默吞掉

**位置**

- `apps/api/src/import/import-job-runner.service.ts:59-62`
- `apps/api/src/import/import-job-runner.service.ts:230-255`
- `apps/api/src/import/import-job-runner.service.ts:348-351`

**现状**

- stale 判定 120 秒、锁 TTL 150 秒，本身窗口就比较紧
- `extendLock()` 的失败结果被 `.catch(() => false)` 直接吞掉

一旦未来导入耗时继续增长，这块会成为重复执行与排障困难的来源。

---

## 五、验证说明

- 本版已经按当前源码重算结论，并移除了昨晚版里已经不成立的高优先级判断
- 本轮确实按全量代码范围复核，但没有运行 build / smoke / regression
- 因此本报告代表静态代码审查结论，不代表运行态验证已经完成
