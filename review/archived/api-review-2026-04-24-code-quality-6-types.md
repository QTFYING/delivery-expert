# API 代码质量专项报告（2026-04-24 · 全量代码排查版）

> 文档状态：历史评审稿，已归档

> 覆盖范围：`apps/api/src` + `packages/types/src` 共 169 个源码文件，`apps/api/prisma` 2 个文件，以及 `apps/api/package.json`
> 目标：基于全量代码排查，抽取 6 类问题：无用代码、设计不合理、冗余代码、已引入库却重复造轮子、可引入优秀库替代、可抽象代码
> 说明：本报告重点讨论代码质量与设计债；当某个问题同时会造成真实业务事故时，会与 senior 报告有少量交叉

## 一、无用代码

### 1. `requiresPasswordReset` 与 `loginAt` 目前都是“写了 / 读了，但业务没有闭环”

**位置**

- `apps/api/prisma/schema.prisma:163-177`
- `apps/api/src/tenant/tenant-admin-user.service.ts:103-114`
- `apps/api/src/tenant/tenant-admin-user.service.ts:232-237`
- `apps/api/src/settings/settings-user.service.ts:142-156`
- `apps/api/src/auth/auth.service.ts:31-57`
- `apps/api/src/auth/auth.service.ts:116-189`
- `apps/api/src/settings/mapping/settings.mapper.ts:15-32`
- `apps/api/src/platform/platform-overview.service.ts:148-175`

**判断**

- `requiresPasswordReset` 会被写入，但登录链路不消费，改密后也不清理
- `loginAt` 会被用户列表和平台健康度读取，但登录时不写

这类字段继续保留，只会制造“看起来有治理、实际上没有”的假象。

### 2. 手工建单契约里残留了多个不会生效的字段

**位置**

- `packages/types/src/contracts/order.ts:85-109`
- `apps/api/src/order/dto/create-order.dto.ts:36-56`
- `apps/api/src/order/dto/update-order.dto.ts:41-79`
- `apps/api/src/order/order.service.ts:152-186`

**判断**

当前现状是：

- `CreateOrderRequest` / `UpdateOrderRequest` 里还保留了 `summary`、`paid`、`status`
- DTO 已经不再接收 `paid` / `status`
- `order.service.ts` 实际也不消费 `summary`

这类字段会误导调用方和维护者，属于接口表面存在、业务上已死的残留契约。

### 3. 账期回款接口的 `remark` 是死字段

**位置**

- `apps/api/src/order/dto/create-order-receipt.dto.ts:13-17`
- `packages/types/src/contracts/order.ts:420-423`
- `apps/api/src/order/order-finance.service.ts:150-258`

**判断**

`CreateOrderReceiptDto` 和 contract 都保留了 `remark`，但 `createReceipt()` 完全没有消费、持久化或回传它。

这是一个典型的“前面留了字段，后面没人用”的接口死字段。

### 4. `auth.config.ts` 里的 `JWT_SECRET ?? ''` 是死兜底

**位置**

- `apps/api/src/config/auth.config.ts:10-15`
- `apps/api/src/config/env.validation.ts:24-26`

**判断**

环境校验已经要求 `JWT_SECRET` 必填；`auth.config.ts` 里的空字符串兜底不会帮助系统恢复，只会掩盖配置问题的真实边界。

## 二、设计不合理的代码

### 1. 账期单 / H5 支付边界没有统一收口

**位置**

- `apps/api/src/order/order.domain.ts:5-18`
- `apps/api/src/order/order.service.ts:160-162`
- `apps/api/src/payment/payment.domain.ts:27-64`
- `apps/api/src/payment/payment-operation.service.ts:57-126`
- `apps/api/src/payment/payment-operation.service.ts:128-219`
- `apps/api/src/import/import-job-runner.service.ts:536-580`

**判断**

- 订单域已经定义：`payType = credit` 时，订单状态应为 `credit`
- H5 状态推导却把这类订单继续映射成 `unpaid`
- H5 发起支付 / 线下登记也不校验 `payType`
- 导入链路还会把 `credit` 单硬写成 `PENDING`

这不是单点 bug，而是支付资格判定被散落在多个模块后产生的语义漂移。

### 2. 过期支付单仍能被晚到成功回调入账

**位置**

- `apps/api/src/payment/payment-query.service.ts:233-247`
- `apps/api/src/payment/payment-webhook.service.ts:67-156`

**判断**

支付单既然已经进入 `EXPIRED`，就不应该再回到成功入账主链路。当前状态机没有把这个边界封死。

### 3. 导入活动任务只做用户级串行，没有租户级串行

**位置**

- `review/plans/import-revamp-plan.md:20`
- `review/plans/import-revamp-plan.md:83`
- `apps/api/src/import/import.service.ts:66-96`
- `apps/api/src/import/import.service.ts:99-147`
- `apps/api/src/import/import-job-runner.service.ts:121-165`

**判断**

规范要求是“同租户单活动任务”，实现却只是“同用户单活动任务”。这会让不同用户在同一租户内各自持有活动导入任务，设计边界没有真正落地。

### 4. 默认密码设计与强制改密设计是脱节的

**位置**

- `apps/api/src/tenant/tenant-admin-user.service.ts:39`
- `apps/api/src/tenant/tenant-admin-user.service.ts:103-114`
- `apps/api/src/tenant/tenant-admin-user.service.ts:232-237`
- `apps/api/src/settings/settings-user.service.ts:27`
- `apps/api/src/settings/settings-user.service.ts:142-156`
- `apps/api/src/auth/auth.service.ts:31-57`

**判断**

这里不是单个常量的问题，而是整套设计的问题：创建用户时默认密码固定，`requiresPasswordReset` 又不参与登录准入，最终变成“本来想降低风险的字段，反而掩盖了风险”。

### 5. 催款提醒接口只记账，不发通知

**位置**

- `docs/api/tenant-api-doc.md:1028-1034`
- `apps/api/src/order/order-finance.service.ts:65-108`
- `apps/api/src/notification/notification.service.ts:13-96`

**判断**

接口对外语义是“创建提醒并触发通知渠道”，当前实现却只有数据库记录和审计日志，没有任何通知派发。这属于设计目标和落地结果明显错位。

## 三、冗余代码

### 1. `PaymentService` 基本是纯转发层

**位置**

- `apps/api/src/payment/payment.service.ts:20-68`

**判断**

当前这个 service 几乎不承载业务规则，只是把 controller 请求转发给 `PaymentQueryService`、`PaymentOperationService`、`PaymentWebhookService`。如果后续没有统一编排逻辑，它就是一层低增益中转。

### 2. 审计日志 helper 被拆成了两份几乎相同的实现

**位置**

- `apps/api/src/settings/settings.shared.ts:14-50`
- `apps/api/src/tenant/tenant.shared.ts:8-45`

**判断**

`getOperatorDisplayName` / `getTenantActorName` 和 `createAuditLog` / `createTenantAuditLog` 的核心逻辑高度重复，只是命名不同。

### 3. 多个模块都各自维护一份“取 tenantId，不是租户侧就抛错”的 helper

**位置**

- `apps/api/src/settings/settings.shared.ts:6-12`
- `apps/api/src/order/order.shared.ts:6-12`
- `apps/api/src/payment/payment.shared.ts:4-10`

**判断**

这类差异只在文案的 helper 持续复制，收益很低，维护点却越来越多。

### 4. `FinanceService` / `NotificationService` 又造了一遍分页 helper

**位置**

- `apps/api/src/common/validators.ts:7-14`
- `apps/api/src/finance/finance.service.ts:268-275`
- `apps/api/src/notification/notification.service.ts:98-105`

**判断**

仓库已经有公共 `normalizePage()` / `normalizePageSize()`，但 `finance` 和 `notification` 又各自写了一份本地实现。这类重复不会立刻出事故，但会持续拉高小改动的扩散面。

## 四、已引入库却重复造轮子的代码

### 1. 已引入 `dayjs`，但 `parseDate()` 仍用松散的 `new Date()`

**位置**

- `apps/api/src/common/validators.ts:46-55`

**判断**

同一个文件已经在用 `dayjs` 格式化时间，但解析仍然直接走 `new Date(value)`。这会让解析规则依赖宿主环境，而且与项目已有日期工具链不一致。

### 2. 导入日期解析也在重复走 `new Date()`

**位置**

- `apps/api/src/import/mapping/import.mapper.ts:100-107`

**判断**

导入链路同样手写了 `readDate()`，继续直接用 `new Date()` 判合法性。项目已经在多个模块采用 `dayjs`，这里没有必要再维护第二套日期解析口径。

### 3. 已引入 `class-validator`，但 UUID 判断仍在 service 层手写正则

**位置**

- `apps/api/src/payment/payment.shared.ts:12-13`
- `apps/api/package.json:33-34`

**判断**

项目已经引入 `class-validator`，但 `isUuid()` 仍自己维护一份正则。它不是不能用，而是继续增加了一处“规则到底谁说了算”的维护点。

## 五、可以引入优秀库替代的代码

### 1. 公开接口限流建议直接引入 `@nestjs/throttler`

**位置**

- `apps/api/src/auth/auth.controller.ts:31-65`
- `apps/api/src/payment/payment.controller.ts:68-166`
- `apps/api/package.json:21-45`

**判断**

登录、H5、Webhook 都没有限流能力。这个问题没必要自己再造一层中间件，直接用 Nest 官方节流方案更稳，也更容易统一配置。

### 2. 日志建议引入 `nestjs-pino` / `pino`

**位置**

- `apps/api/src/common/filters/business-exception.filter.ts:55-61`
- `apps/api/src/payment/payment-webhook.service.ts:29-31`
- `apps/api/src/import/import-job-runner.service.ts:66`

**判断**

现在项目里同时存在 `Logger`、`console.error`、手工 `[AUDIT]` 字符串三种风格。继续手工拼日志，后续字段化检索、链路关联和告警都会越来越重。

### 3. 导入任务的轮询 + 锁 + 心跳，长期更适合交给 `BullMQ`

**位置**

- `apps/api/src/import/import-job-runner.service.ts:59-62`
- `apps/api/src/import/import-job-runner.service.ts:230-369`
- `apps/api/src/import/import-job-runner.service.ts:516-638`

**判断**

当前实现已经自己维护了轮询、stale 判定、分布式锁、续锁、用户活动任务态、失败恢复。导入任务再继续扩张，这一块就会越来越像“在业务仓库里自己实现半个队列系统”。

## 六、可抽象的代码

### 1. 多个 service 已明显超过仓库约束上限

**位置**

- `apps/api/src/import/import-job-runner.service.ts`：638 行
- `apps/api/src/order/order-print.service.ts`：529 行
- `apps/api/src/order/order.service.ts`：467 行
- `apps/api/src/tenant/tenant.service.ts`：470 行
- `apps/api/src/import/import.service.ts`：409 行

**判断**

仓库规则已经明确 `*.service.ts` 默认不超过 400 行。现在这些文件继续堆功能，只会让 review、回归和职责边界越来越模糊。

### 2. 订单状态推导已经发生“同一规则多处散落”，应抽成统一域规则

**位置**

- `apps/api/src/order/order.domain.ts:5-18`
- `apps/api/src/payment/payment-ledger.service.ts:121-126`
- `apps/api/src/import/import-job-runner.service.ts:536-580`

**判断**

- `order.domain.ts` 已经有 `deriveOrderStatus()`
- `PaymentLedgerService` 又复制了一版私有状态推导
- `ImportJobRunnerService` 干脆绕过状态推导，直接把导入订单写成 `PENDING`

这已经不是“抽象得更优雅”这么简单，而是因为没有统一规则源，真实产生了账期单状态漂移。

### 3. 账期回款与支付台账写入逻辑已经开始分叉

**位置**

- `apps/api/src/payment/payment-ledger.service.ts:19-115`
- `apps/api/src/order/order-finance.service.ts:212-247`

**判断**

`PaymentLedgerService` 负责 payment 记录和订单已付金额回写；`OrderFinanceService.createReceipt()` 又手工写了一套 payment + order 更新。后续金额规则一旦调整，很容易出现一边修了另一边漏掉。

### 4. 审计日志已经具备抽成统一 `AuditLogService` 的条件

**位置**

- `apps/api/src/settings/settings.shared.ts:14-50`
- `apps/api/src/tenant/tenant.shared.ts:8-45`
- `apps/api/src/order/order-finance.service.ts:98-107`
- `apps/api/src/order/order-print.service.ts:196-205`

**判断**

现在审计日志一部分走 helper，一部分直接 `tx.auditLog.create()`；字段风格、操作者解析和 IP 处理也不完全一致。这里已经具备抽成统一应用服务的条件。

## 七、优先级建议

1. 先处理“设计不合理”里的支付状态机、账期单 H5 边界、导入租户级串行和默认密码问题，这些最容易真的出事故。
2. 再补 `@nestjs/throttler` 与统一日志方案，这两项投入不大、收益很直接。
3. 最后处理大文件拆分、统一状态推导和统一审计日志，否则这批业务规则还会继续散落。
