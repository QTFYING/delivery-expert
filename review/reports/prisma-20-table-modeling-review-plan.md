# Prisma 20 表建模审查与改造计划

> 审查日期：2026-05-16
> 审查范围：`apps/api/prisma/schema.prisma` 当前 20 个 model
> 审查方式：按 `docs/api/*.md -> packages/types/src/enums -> packages/types/src/contracts -> docs/prisma/data-model-reference.md -> apps/api` 对照当前可执行 schema。
> 验证状态：`pnpm -F api exec prisma validate` 已通过。

## 1. 总体结论

当前 20 张表的主方向是成立的：多租户业务表大多显式包含 `tenantId`，金额字段使用 `Decimal`，支付单、支付流水、支付回调审计也已拆成独立模型。整体不是推倒重来的状态。

但从资深后端建模视角看，当前设计仍有几类结构性风险：

- 部分幂等语义只靠应用层折中，数据库结构不能完整表达业务事实。
- 部分并发互斥依赖 Redis 或服务层，数据库缺少最终兜底约束。
- 软删除表仍使用普通唯一键，和“只约束活跃数据”的业务语义不完全一致。
- 金额、计数、状态组合缺少数据库 check 保护，支付链路虽然有 domain/ledger 防护，但物理层仍偏弱。
- 审计与账务追溯存在若干“靠字符串约定串联”的设计，后续对账和排障成本会升高。

## 2. 高优先级问题

### 2.1 `order_print_records` 打印幂等建模重新判断：当前唯一键合理，契约需收敛

状态：已完成，完成日期：2026-05-16。

位置：`apps/api/prisma/schema.prisma` 的 `OrderPrintRecord`

当前唯一键：

```prisma
@@unique([tenantId, requestId], map: "order_print_records_tenant_request_key")
```

问题：

- 补充业务前提：实际不存在服务端意义上的“批量打印”；前端的批量打印只是对单张订单打印动作做 `for` 循环。
- 在该前提下，`requestId` 的真实语义应是“单次订单打印事件”的幂等键，而不是“打印批次”的幂等键。
- 因此 `(tenantId, requestId)` 唯一键本身是合理的，能够表达同一租户内单次打印回执的幂等边界。
- 当前更准确的问题不在数据模型，而在接口契约仍暴露 `orderIds: string[]`，并让文档描述看起来像服务端支持一个批次内多张订单。
- 实现层对多 `orderIds` 请求只给第一条事件写 `requestId`，这是为了适配旧契约形态的折中；如果后续统一单订单回执，该折中应删除。

建议：

- 不新增 `order_print_batches`，也不调整当前 `(tenantId, requestId)` 唯一键。
- 将打印成功回执契约从 `orderIds: string[]` 收敛为单订单语义，例如 `orderId: string`。
- 若为了前端兼容暂时保留 `orderIds`，应明确只允许长度为 `1`，服务端超过 1 直接返回 `400`。
- 文档同步改为“前端批量打印由前端循环调用单订单回执接口完成，服务端每次只确认一个订单打印结果”。
- 实现层改为每次只写一条 `order_print_records`，并把 `requestId` 写在该事件上；重复提交按 `(tenantId, requestId)` 幂等返回。

已落地：

- `docs/api/tenant-api-doc.md` 已改为单订单打印成功回执语义，明确前端批量打印由前端循环调用接口完成。
- `packages/types/src/contracts/order.ts` 已为 `OrderPrintRecordRequest` 增加 `orderId?: string`，保留 `orderIds?: string[]` 作为旧前端兼容字段。
- `apps/api/src/order/dto/create-order-print-record.dto.ts` 已将 `orderIds` 改为可选且最大长度为 1。
- `apps/api/src/order/order-print.service.ts` 已统一解析为单个 `orderId`，并拒绝缺失订单 ID、多个 `orderIds`、`orderId` 与 `orderIds[0]` 不一致、同一 `requestId` 换订单复用。
- `apps/api/src/order/order.swagger.ts` 已同步响应示例，`totalCount / successCount` 成功场景为 1。
- `apps/api/test/regression/runner.js` 已覆盖新 `orderId`、旧 `orderIds: [id]`、非法多订单、字段不一致、缺失订单 ID、复用 `requestId` 到另一订单等场景。

验证结果：

- `pnpm -F @shou/types build` 通过。
- `pnpm -F api prisma:generate` 通过。
- `pnpm -F api prisma:push` 通过，用于同步本地回归数据库。
- `pnpm -F api build` 通过。
- `pnpm -F api test:backend-regression` 通过。

说明：本项未改 `apps/api/prisma/schema.prisma`，未新增表，未改 `docs/prisma/data-model-reference.md`。原因是确认后的业务事实为“服务端只承载单订单打印事件”，当前 `(tenantId, requestId)` 唯一键已经能表达该幂等边界。

### 2.2 `import_jobs` 缺少数据库级租户活动任务互斥

位置：`apps/api/prisma/schema.prisma` 的 `ImportJob`

现状：

- 服务层用 Redis 租户活动槽位防止同租户并发创建多个正式导入任务。
- 数据库只有 `(tenantId, status)` 与 `(status, heartbeatAt)` 索引。

问题：

- 多实例、Redis 异常、TTL 边界或人工写库场景下，数据库不能阻止同一租户多个 `pending/processing` 任务并存。
- 这会冲击导入顺序、覆盖策略、`importRevision` 与订单防重。

建议：

- 通过 SQL migration 增加 PostgreSQL partial unique index：

```sql
CREATE UNIQUE INDEX import_jobs_one_active_per_tenant
ON import_jobs ("tenantId")
WHERE status IN ('pending', 'processing');
```

- Prisma schema 仍保留普通索引用于查询；partial unique 需要在迁移 SQL 中维护。

### 2.3 软删除表的唯一键和业务语义不一致

涉及表：

- `users.account`
- `import_templates(tenantId, name)`
- `orders(tenantId, sourceOrderNo)`

问题：

- 业务查询普遍按 `deletedAt = null` 过滤。
- 当前唯一键是物理全量唯一。
- 用户删除时通过改写 `account` 绕开唯一键；导入模板名称大小写不敏感只在应用层检查；订单源单号软删后是否允许复用语义不够清晰。

建议：

- 明确软删后是否允许复用业务唯一值。
- 若允许复用，改为 partial unique：

```sql
CREATE UNIQUE INDEX users_active_account_key
ON users (account)
WHERE "deletedAt" IS NULL;
```

- 模板名建议使用大小写不敏感唯一：

```sql
CREATE UNIQUE INDEX import_templates_active_tenant_lower_name_key
ON import_templates ("tenantId", lower(name))
WHERE "deletedAt" IS NULL;
```

- 订单 `sourceOrderNo` 若仍作为租户内防重主键，也建议使用活跃订单 partial unique，并单独确认作废/软删后的复用规则。

### 2.4 金额与计数字段缺少数据库 check 约束

涉及表：

- `orders.totalAmount`
- `orders.paid`
- `orders.prints`
- `orders.printFailedCount`
- `order_items.quantity/unitPrice/lineAmount`
- `payments.amount/fee/net`
- `payment_orders.amount`
- `import_jobs.*Count`
- `id_sequences.currentVal`

现状：

- 应用层已有金额工具、支付 domain 与 ledger 逻辑。
- 数据库层没有非负、累计边界、计数边界保护。

建议：

- 为核心金额和计数字段增加 check constraints：

```sql
ALTER TABLE orders
ADD CONSTRAINT orders_amount_non_negative
CHECK ("totalAmount" >= 0 AND paid >= 0);
```

- 是否增加 `paid <= totalAmount` 需要结合“超收/异常流水”业务规则确认；若业务不允许超收，应加约束。
- `order_items.lineAmount = quantity * unitPrice` 不建议直接强约束，因小数舍入会带来边界问题；可以仅约束非负，并在 domain 校验乘积关系。

## 3. 中优先级问题

### 3.1 `payments` 未直接关联 `payment_orders`

位置：`Payment`、`PaymentOrder`

问题：

- 线上回调和线下核销最终都生成 `payments`。
- 当前主要通过 `gatewayTradeNo` 约定把流水和支付单串起来。
- 线下流水使用 `cash_${paymentOrder.id}` / `other_${paymentOrder.id}` 这类字符串约定，能用但追溯不够硬。

建议：

- `payments` 增加可空 `paymentOrderId`。
- 对线上和线下确认入账流水都写入该字段。
- 可按需要增加 `@@index([paymentOrderId])` 或唯一约束，确保同一支付单只生成一条确认流水。

### 3.2 多租户操作人引用缺少同租户物理保证

涉及表：

- `order_print_records.operatorId`
- `order_reminders.operatorId`
- `notice_reads.userId + tenantId`

问题：

- 这些表都同时存 `tenantId` 和 `userId/operatorId`，但外键只指向 `users.id`。
- 数据库无法保证该用户属于同一个租户。
- 当前主要靠登录态和服务层写入保证。

建议：

- 若需要物理层强约束，可给 `users` 增加 `(id, tenantId)` 复合唯一。
- 子表改用复合外键引用 `(operatorId, tenantId)`。
- 注意平台用户 `tenantId = null`，该策略仅适用于租户侧操作人字段。

### 3.3 `tenant_certifications` 允许同租户多条并行待审

位置：`TenantCertification`

问题：

- 当前每次提交资质都会新增记录，查询取最近一次。
- 若业务只允许一个进行中的审核流程，schema 没有阻止同租户多条 `pending_*` 记录。

建议：

- 先确认业务是否允许重新提交覆盖旧审核。
- 若不允许并行待审，增加 partial unique：

```sql
CREATE UNIQUE INDEX tenant_certifications_one_active_per_tenant
ON tenant_certifications ("tenantId")
WHERE status IN ('pending_initial_review', 'pending_secondary_review', 'pending_confirmation');
```

### 3.4 `audit_logs.targetType` 枚举偏窄

位置：`AuditLog`

问题：

- 当前闭集只有 `account/role/tenant`。
- 实现里订单打印失败等动作也写审计，只能塞到 `tenant` 类型。
- 长期会影响审计筛选、运营排障和权限审查。

建议：

- 扩展审计对象类型，例如 `order/payment/import/print/config`。
- 同步 `packages/types/src/enums/common.ts`、`docs/api`、Prisma enum 与 mapper。

## 4. 可观察但不急改的问题

### 4.1 `notices` 建模先于 Admin 发布能力

`docs/api/admin-api-doc.md` 标记 Admin `/notices/*` 为远景规划，但 `Notice/NoticeRead` 已存在，Tenant 端通知读取已落地。

这不是错误，但后续落地 Admin 发布能力时需要补齐：

- 公告 audience 的闭集或结构化表达。
- 定时发布任务如何推进 `scheduled -> published`。
- 已发布公告是否允许编辑、下架、删除。

### 4.2 `PrinterTemplate.importTemplateId` 的双唯一略冗余

当前同时有：

- `importTemplateId @unique`
- `@@unique([tenantId, importTemplateId])`

由于 `importTemplateId` 本身全局唯一，第二个唯一约束在逻辑上冗余，但它也表达了查询维度。可以保留；若追求更干净，可保留复合唯一并移除单列唯一，但需确认 Prisma 一对一 relation 的表达方式。

### 4.3 H5 入口令牌 `qrCodeToken` 命名存在历史语义折中

文档已明确 `orders.qrCodeToken` 业务语义等同 `h5EntryToken`。当前可以接受，不建议为了命名洁癖立即迁移字段。

若后续有大版本迁移，可考虑统一字段名为 `h5EntryToken`，但这会影响 API、前端、打印二维码和既有数据，不应作为当前优先事项。

## 5. 建议改造顺序

### T01：打印成功回执契约收敛（已完成）

目标：

- 将打印成功回执收敛为服务端单订单事件，和当前 `(tenantId, requestId)` 幂等唯一键保持一致。

建议改动：

- 已完成：不新增表，不新增打印批次模型。
- 已完成：`OrderPrintRecordRequest` 增加 `orderId`，保留 `orderIds` 但强制长度为 1。
- 已完成：`docs/api/tenant-api-doc.md` 明确前端批量打印只是循环调用单订单回执。
- 已完成：`OrderPrintService` 每次只创建一条 `order_print_records`，`requestId` 始终写入该事件。
- 已确认无需同步：`docs/prisma/data-model-reference.md`。本项未改 schema，建模参考不变。

验证：

- 已通过：`pnpm -F @shou/types build`
- 已通过：`pnpm -F api build`
- 已通过：`pnpm -F api test:backend-regression`
- 已覆盖：单订单打印成功重复提交回归用例
- 已覆盖：旧 `orderIds: [id]` 兼容回归用例
- 已覆盖：多订单数组入参拒绝回归用例
- 已覆盖：`orderId` 与 `orderIds[0]` 不一致拒绝回归用例
- 已覆盖：打印失败重复提交回归用例

### T02：导入活动任务物理互斥

目标：

- 数据库兜底保证同租户只有一个 `pending/processing` 导入任务。

建议改动：

- 增加 partial unique index migration。
- 保留 Redis 活动槽位作为快速路径。
- 补充导入并发提交回归。

验证：

- `pnpm -F api build`
- 导入提交并发回归

### T03：软删除唯一键策略统一

目标：

- 明确活跃数据唯一与历史数据留存的关系。

建议改动：

- 梳理 `users`、`import_templates`、`orders` 的软删后复用规则。
- 迁移普通唯一键为 partial unique。
- 模板名改为大小写不敏感唯一。

验证：

- `pnpm -F api build`
- 用户删除后账号复用测试
- 模板名称大小写冲突测试
- 订单源单号冲突测试

### T04：金额与计数 check 约束

目标：

- 让数据库阻止明显非法金额和负计数。

建议改动：

- 为订单、订单明细、支付流水、支付单、导入任务计数字段增加 check constraints。
- 是否增加 `orders.paid <= orders.totalAmount` 需先确认业务是否允许超收异常态。

验证：

- `pnpm -F api build`
- 支付回调、线下核销、导入订单金额回归

### T05：支付流水关联支付单

目标：

- 提升线上回调、线下核销、支付流水之间的可追溯性。

建议改动：

- `payments` 增加 `paymentOrderId`。
- 线上回调和线下核销写流水时带上支付单 ID。
- 若业务要求同一支付单只入账一次，增加唯一约束。

验证：

- `pnpm -F api build`
- 线上回调幂等回归
- 线下核销重复提交回归

### T06：审计对象类型扩展

目标：

- 避免不同业务动作都落到 `tenant` 审计对象类型。

建议改动：

- 扩展 `AuditTargetTypeEnum`。
- 同步 enums、docs/api、Prisma enum、mapper 和使用点。

验证：

- `pnpm -F api build`
- 操作日志查询回归

## 6. 不建议当前立即做的事

- 不建议为了 `qrCodeToken` 命名立即迁移到 `h5EntryToken`。
- 不建议把所有 JSON 黑盒配置拆列，打印配置和支付渠道配置当前保留 `Json` 是合理的。
- 不建议一次性重构所有表关系；优先处理幂等、并发、金额和软删除唯一这四类会直接影响生产正确性的点。
