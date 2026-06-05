# API 契约一致性审查与整改建议

## 1. 文档定位

本文件记录 2026-06-02 对 `docs/api/*` 与 `packages/types/*` 的契约一致性审查结果，供后续整改排期、拆分任务和交接使用

本文件不是 API 事实源。涉及接口语义、字段、枚举或状态机变更时，仍以以下顺序执行：

1. `docs/api/*.md`
2. `packages/types/src/enums`
3. `packages/types/src/contracts`
4. Swagger / DTO
5. `docs/prisma/data-model-reference.md`
6. 实现代码

本次审查重点：

- H5 支付状态与订单主状态边界
- Tenant 与 Admin 的角色、用户状态和租户生命周期边界
- 订单导入、自定义字段和映射模板字段命名
- 支付金额、支付动作和线下登记确认语义
- 规划域 contracts 是否误暴露为当前事实源

## 2. 归档状态

状态：已归档

归档日期：2026-06-02

整体完成情况：

- 已完成落地：P0-01、P0-02、P1-03、P1-04、P2-09、P2-10、P2-11、P3-13
- 已裁决但暂不改代码：P2-12
- 已降级或暂缓改造：P1-05、P1-06、P1-07、P1-08、P3-14
- 本轮已完成 Tenant/H5 支付状态、线下登记确认、关键字段命名和金额传输规范裁决
- OS/Admin 权限体系、Admin 代管 Tenant 用户、资质审核拒绝原因、创建租户初始渠道和规划 contracts 导出治理均不进入当前租户端优先交付批次

归档说明：

- 本文档从 `review/plans` 移入 `review/archived`，不再作为当前执行队列
- 后续若恢复暂缓项，应以对应 P 编号重新开小范围任务，不直接在本归档文档上继续推进
- 已完成项的事实源已同步到 `docs/api`、共享 enums/contracts、Swagger/DTO、实现或数据库迁移中；归档文档仅保留审查记录和决策过程

## 3. 总体结论

当前未发现 `erpOrderNo`、旧 `payStatus`、废弃 `/print/jobs` 直接回流

当前主要风险集中在四类：

- 支付状态机：H5 页面状态、支付单状态、订单主状态混用
- 租户边界：租户冻结、入驻中、关注状态对 H5 收款裁决没有闭合
- 用户与 RBAC：Tenant 新 RBAC 为当前主线；OS/Admin 暂无权限体系，Admin `role / scope` 与 Tenant RBAC 的冲突已降级为未来演进风险
- 字段命名：`customFieldValues / customerFieldValues`、`templateId / mappingTemplateId`、`creditReminderDays / creditRemindDays` 均已完成收敛

整改建议按风险优先级推进，不建议一次性大范围重写全部文档和 contracts

## 4. 问题与建议

### P0-01 H5 文档混用 `OrderStatus` 与 `PaymentOrderStatus`

状态：已完成

落地结果：

- `docs/api/h5-api-doc.md` 已统一称 `status` 为“H5 支付状态”
- 已删除“订单状态迁移为 `paying`”这类表述，改为创建或恢复 `payment_orders.status=paying` 的在线支付尝试，H5 支付状态投影为 `paying`
- `docs/api/api-architecture-overview.md` 已补充订单主状态、H5 支付状态与支付单状态的边界
- `packages/types/src/contracts/payment.ts` 与支付 Swagger 描述已同步使用“H5 支付状态”

原问题：

H5 文档多处把 `unpaid / paying / pending_verification` 描述成“订单状态”，但这些值属于 `PaymentOrderStatus`，不是订单主状态 `OrderStatus`

原始证据：

- `packages/types/src/enums/order.ts`：`OrderStatus` 为 `pending / partial / paid / expired / credit`
- `packages/types/src/enums/payment.ts`：`PaymentOrderStatus` 为 `unpaid / paying / pending_verification / paid / expired`
- `docs/api/h5-api-doc.md`：存在“后端将订单状态迁移为 `paying`”“订单状态不是 `unpaid`”等描述
- `packages/types/src/contracts/payment.ts`：`CreateOfflinePaymentVerificationResponse` 同时返回 `orderStatus` 与 `paymentStatus`

原影响：

- 可能把 `paying / unpaid / pending_verification` 写回订单主状态
- Admin / Tenant 订单列表状态闭集会被破坏
- 支付回调、线下登记确认、内部收款的状态裁决容易混乱

原建议：

- `docs/api/h5-api-doc.md` 中统一称 `status` 为“H5 支付状态”
- 删除“订单状态迁移为 `paying`”，改成“创建或恢复一条 `payment_orders.status=paying` 的在线支付尝试，H5 支付状态投影为 `paying`”
- 在 `docs/api/api-architecture-overview.md` 增加状态边界说明：订单主状态与 H5 支付状态是两套状态机
- `OrderStatus` 只用于 Admin / Tenant 订单主状态，不接收 `unpaid / paying / pending_verification`

### P0-02 H5 支付裁决缺少租户生命周期状态

状态：已完成

落地结果：

- `docs/api/h5-api-doc.md` 已明确 H5 在线支付和线下登记必须纳入租户生命周期状态裁决
- `paymentAction.canInitiate` 仅在租户状态为 `active` 或 `attention` 时可能为 `true`
- `POST /pay/:token/initiate` 和 `POST /pay/:token/offline-payment` 已对 `paused` / `onboarding` 租户返回 `1006` 并拒绝动作
- `docs/api/api-architecture-overview.md` 与 `docs/api/admin-api-doc.md` 已补充跨端冻结租户阻断 H5 收款边界
- `static_alias/apps/h5` 已在服务端返回租户生命周期阻断文案时禁用整张支付方式面板，避免前端继续引导线下登记

原问题：

H5 的 `paymentAction.canInitiate` 当前只描述订单是否可支付、支付有效期、`activePaymentChannel` 和渠道配置状态，没有纳入租户状态

原始证据：

- `packages/types/src/enums/tenant.ts`：`TenantStatus` 包含 `active / onboarding / attention / paused`
- `docs/api/admin-api-doc.md`：新建租户为 `onboarding`，冻结后为 `paused`
- `docs/api/h5-api-doc.md`：`canInitiate` 条件未包含租户状态

原影响：

- 冻结租户理论上仍可能通过 H5 收款
- 入驻中租户是否可收款不明确
- 平台冻结和支付风控边界不闭合

原建议：

- 明确 H5 发起在线支付和线下登记至少要求 `tenant.status=active`
- `paused` 必须 `canInitiate=false` 且线下登记也不可提交
- `onboarding` 默认不允许 H5 收款
- `attention` 建议允许 H5 收款，但 Admin / Tenant 可展示续费或风险提醒
- 在 `docs/api/admin-api-doc.md` 跨端关联补充：冻结租户会阻断 H5 收款入口

### P1-03 `PaymentAction.canInitiate` 同时表达在线支付与线下登记

问题：

`PaymentAction.canInitiate` 在 contract 中是“是否允许重新发起在线支付”，但 H5 文档又把它描述成“是否允许发起新的在线支付或线下登记”

原始证据：

- `packages/types/src/contracts/payment.ts`：`canInitiate` 注释为在线支付
- `docs/api/h5-api-doc.md`：`paymentAction` 表示在线支付动作，同时又写 `canInitiate` 裁决在线支付或线下登记

影响：

- 线上渠道不可用时，前端可能错误隐藏现金或其他已付登记入口
- 支付渠道配置状态与线下登记能力被错误耦合

原建议：

- 推荐拆成 `onlinePaymentAction` 与 `offlinePaymentAction`
- 在线支付裁决依赖支付渠道、支付有效期、收银台尝试状态
- 线下登记裁决依赖订单是否可登记、租户状态、支付有效期和是否已有待处理支付单
- 如短期不改 contract，文档应恢复 `canInitiate` 仅表达在线支付能力，线下登记另写独立规则

### P1-04 `other_paid` 与线下登记确认模型不闭合

状态：已完成

落地结果：

- H5 `cash` 与 `other_paid` 两种线下登记均进入 `pending_verification`，并统一由 Tenant 财务执行线下登记确认
- Tenant 主确认接口已统一为 `POST /orders/{id}/offline-payment-verifications`
- 历史兼容接口 `POST /orders/{id}/cash-verifications` 已保留，但只作为兼容路径，内部调用同一确认逻辑
- 权限码已由 `payments.cash_verify.create` 调整为 `payments.offline_payment_verify.create`
- 共享枚举已由 `CashVerifyStatus` 演进为 `OfflinePaymentVerifyStatus`
- 共享字段已由 `cashVerifyStatus / cashVerifyStatusText` 调整为 `offlineVerifyStatus / offlineVerifyStatusText`
- Prisma 物理模型和 dev 数据库已由 `cashVerifyStatus / cashVerifiedAt` 迁移为 `offlineVerifyStatus / offlineVerifiedAt`
- 数据库 enum 已由 `CashVerifyStatusEnum` 迁移为 `OfflinePaymentVerifyStatusEnum`，枚举值仍保持 `pending / verified`
- H5 页面、H5 mock、Tenant 角色权限文案、Swagger、回归测试路径已同步为线下登记确认语义

原问题：

H5 支持 `cash` 与 `other_paid` 两种线下登记，二者都进入 `pending_verification`，但 Tenant 侧接口、权限和字段仍以“现金核销”为中心

原始证据：

- `packages/types/src/enums/payment.ts`：`OfflinePaymentMethod` 包含 `cash / other_paid`
- `docs/api/h5-api-doc.md`：`other_paid` 进入 `pending_verification`，等待 Tenant 财务确认
- `docs/api/tenant-finance.md`：确认接口曾为 `/orders/{id}/cash-verifications`
- `packages/types/src/contracts/payment.ts`：曾使用 `cashVerifyStatus` 且注释为仅现金支付时有值

原影响：

- `other_paid` 如何确认、确认后如何展示状态不明确
- 财务权限命名与真实业务能力不匹配
- 对账与流水中现金核销和其他线下确认边界不清晰

原建议：

- 推荐将接口语义升级为“线下登记确认”
- 新接口可命名为 `/orders/{id}/offline-payment-verifications`
- 权限可调整为 `payments.offline_payment_verify.create`
- `CashVerifyStatus` 长期应演进为 `OfflinePaymentVerifyStatus`
- 如保留历史路径，文档必须明确 `/cash-verifications` 实际处理所有 `OfflinePaymentMethod`

验证结果：

- `pnpm -F @shou/types build` 通过
- `pnpm -F api build` 通过
- `pnpm -C static_alias -F h5 build` 通过
- `git diff --check` 通过
- MCP 已确认 dev 数据库存在 `offlineVerifyStatus / offlineVerifiedAt` 和 `OfflinePaymentVerifyStatusEnum`
- `pnpm -C static_alias -F tenant build` 仍被既有订单/账期类型问题阻断，失败点不属于 P1-04

### P1-05 Admin 用户管理 `role / scope` 与 Tenant 新 RBAC 冲突

状态：已降级，暂缓改造

当前裁决：

- 当前只有 Tenant 端有 RBAC，OS/Admin 暂时没有权限体系
- 当前优先目标是完成租户端，Tenant 用户授权仍以 `/settings/users` 和 `roleId / roleCode / roleName` 为准
- Admin 用户合同中的 `role / scope` 目前不参与 Tenant RBAC 授权，不作为 Tenant 用户角色事实源
- 只要 Admin `/users` 不用于创建或修改 Tenant 用户角色绑定，当前没有必须马上修复的业务闭环问题

原问题：

Tenant 新 RBAC 使用 `roleId / roleCode / roleName`，Admin 用户合同仍使用自由文本 `role / scope`，容易被误解为同一套用户授权模型

原始证据：

- `docs/api/tenant-api-doc.md`：Tenant 用户新契约使用 `roleId / roleCode / roleName`
- `docs/api/tenant-settings.md`：创建和更新 Tenant 用户使用 `roleId`
- `packages/types/src/contracts/settings.ts`：Tenant 用户读写使用 `roleId / roleCode / roleName`
- `packages/types/src/contracts/auth.ts`：`AuthMeResponse` 返回 `roleId / roleCode / roleName`
- `packages/types/src/contracts/tenant.ts`：Admin 用户列表和创建仍使用 `role: string`、`scope: string`

当前影响判断：

- 这是未来 OS/Admin 权限体系或 Admin 代管 Tenant 用户时的设计风险
- 对当前 Tenant RBAC 主链路无直接阻塞
- 当前阶段不建议为此重构 Admin 用户合同，避免扩散到非租户端优先目标

后续触发条件：

- OS/Admin 开始建设独立权限体系
- Admin 需要代管 Tenant 用户、分配 Tenant 角色或写入 Tenant 角色绑定
- Admin `/users` 需要与 Tenant `/settings/users` 共享用户读写模型

后续建议：

- 若 Admin 仅管理平台侧用户，应单独设计平台用户合同，不复用 Tenant RBAC 字段
- 若 Admin 代管 Tenant 用户，应新增或拆分代管接口，并返回/接收 `roleId`，同时显式带租户边界
- `scope` 不应作为 Tenant 用户授权事实源

### P1-06 Admin `UserStatus` 与 Tenant `UserSimpleStatus` 不一致

状态：已降级，暂缓改造

当前裁决：

- 当前优先完成 Tenant 端，Tenant 设置端用户状态继续以 `UserSimpleStatus = active / disabled` 为事实源
- OS/Admin 暂无权限体系，也不作为当前 Tenant 用户状态管理主链路
- `invited / locked` 暂不进入 Tenant 设置端用户管理语义，不反向影响 Tenant 的启用/禁用能力
- 当前不为此改 contracts 或实现，避免把未来 OS/Admin 用户管理能力提前混入租户端主线

原问题：

Admin 用户状态包含 `invited / locked`，Tenant 用户状态只有 `active / disabled`；如果未来 Admin 要管理 Tenant 用户状态，需要定义跨端投影规则

原始证据：

- `packages/types/src/enums/tenant.ts`：`UserStatus = active / invited / locked / disabled`
- `packages/types/src/enums/common.ts`：`UserSimpleStatus = active / disabled`
- `docs/api/admin-api-doc.md`：Admin 用户状态使用 `UserStatus`
- `docs/api/tenant-settings.md`：Tenant 用户状态使用 `UserSimpleStatus`
- `packages/types/src/contracts/tenant.ts`：Admin 用户状态字段为 `UserStatus`
- `packages/types/src/contracts/settings.ts`：Tenant 设置用户状态字段为 `UserSimpleStatus`

当前影响判断：

- 对当前 Tenant 设置端用户启用/禁用主链路无直接阻塞
- 风险主要出现在未来 OS/Admin 建设用户管理、锁定、邀请或代管 Tenant 用户时
- 当前阶段不建议将 Tenant 用户列表改为完整 `UserStatus`，也不建议提前设计 `invited / locked` 的 Tenant 展示投影

后续触发条件：

- OS/Admin 开始管理用户状态、邀请状态或锁定状态
- Admin 需要代管 Tenant 用户状态
- 登录、锁定、禁用需要在 Admin 与 Tenant 两端形成统一审计闭环

后续建议：

- 若 OS/Admin 要管理 Tenant 用户状态，再单独定义 `UserStatus` 到 Tenant 展示状态的投影规则
- Tenant 状态更新接口仍应只允许租户侧设置 `active / disabled`
- `locked / invited` 若进入租户端展示，应只读展示，不应被 Tenant 的启用/禁用动作静默覆盖

### P1-07 `CreateTenantRequest.channel: string` 残留旧支付渠道语义

状态：暂缓改造

问题：

Admin 创建租户请求仍包含 `channel: string`，但当前支付渠道已经是以 `{channel}` 为资源维度保存和激活

证据：

- `packages/types/src/contracts/tenant.ts`：`CreateTenantRequest` 包含 `channel: string`
- `packages/types/src/enums/payment.ts`：已有 `PaymentChannel` 闭集
- `docs/api/admin-api-doc.md`：创建租户不承载生效支付渠道切换
- `docs/api/tenant-settings.md`：支付配置以 `{channel}` 为资源维度

影响：

- 前端可能误以为创建租户时可直接设置线上收款渠道
- `string` 绕过 `PaymentChannel` 闭集
- 创建租户、保存渠道配置、激活渠道三类动作边界混淆

建议：

- 推荐删除 `CreateTenantRequest.channel`
- 若确需保留，应改为 `initialPaymentChannel?: PaymentChannel`
- 文档必须说明该字段不等于 `activePaymentChannel`

### P1-08 资质审核 `rejectReason` 不闭合

状态：暂缓改造

问题：

Tenant 查询资质状态返回 `rejectReason`，但 Admin 创建资质审核决议请求没有 `rejectReason`

证据：

- `docs/api/admin-api-doc.md`：资质审核可 `reject -> rejected`
- `packages/types/src/contracts/tenant.ts`：`TenantCertificationStatusResult` 包含 `rejectReason`
- `packages/types/src/contracts/tenant.ts`：`CreateTenantCertificationReviewDecisionRequest` 只有 `action` 和 `comment`
- 同文件租户主体审核决议请求包含 `rejectReason`

影响：

- Tenant 端无法稳定展示资质驳回原因
- `comment` 和 `rejectReason` 是否同义不明确
- 租户主体审核与资质审核的驳回语义不一致

建议：

- 推荐在 `CreateTenantCertificationReviewDecisionRequest` 增加 `rejectReason?: string`
- `action=reject` 时 `rejectReason` 必填
- `comment` 保留为内部审核备注
- 如短期不加字段，必须文档明确 `action=reject` 时 `comment` 会作为 `rejectReason` 返回

### P2-09 `customFieldValues` 与 `customerFieldValues` 命名不一致

状态：已完成

落地结果：

- `UpdateOrderRequest`、`UpdateOrderDto` 与订单更新服务入口已统一使用 `customerFieldValues`
- 订单读模型、导入链路、Swagger 示例和文档均保持 `customerFieldValues` 命名
- 不保留 `customFieldValues` 兼容入口，避免两套字段名长期并存

原问题：

订单读模型和导入链路使用 `customerFieldValues`，但 `UpdateOrderRequest` 使用 `customFieldValues`

原始证据：

- `docs/api/tenant-orders.md`：订单级自定义字段为 `customerFieldValues`
- `docs/api/tenant-import-flow.md`：导入链路使用 `orders[].customerFieldValues` 与 `lineItems[].customerFieldValues`
- `packages/types/src/contracts/order.ts`：`TenantOrderItem / AdminOrderItem` 使用 `customerFieldValues`
- `packages/types/src/contracts/order.ts`：`UpdateOrderRequest` 使用 `customFieldValues`

原影响：

- 前端按读模型回填更新时字段名不匹配
- 后端若兼容两套字段，会制造旧字段回流风险

原建议：

- 若手工改单支持维护自定义字段，统一改为 `customerFieldValues`
- 若手工改单不支持维护导入自定义字段，直接从 `UpdateOrderRequest` 删除该字段
- 不建议长期同时支持两套字段名

### P2-10 `templateId` 与 `mappingTemplateId` 命名不统一

状态：已完成

落地结果：

- 订单列表筛选 `OrderListQuery`、`ListOrdersQueryDto` 与后端查询条件已统一为 `mappingTemplateId`
- 订单读模型继续返回 `mappingTemplateId`
- 导入预检请求中的 `templateId` 保留，语义限定为本次导入选择的模板，不再作为订单列表筛选字段

原问题：

订单读模型返回 `mappingTemplateId`，订单筛选和导入请求使用 `templateId`

原始证据：

- `docs/api/tenant-orders.md`：订单列表返回 `mappingTemplateId`
- `packages/types/src/contracts/order.ts`：`TenantOrderItem / AdminOrderItem` 使用 `mappingTemplateId`
- `packages/types/src/contracts/order.ts`：`OrderListQuery.templateId`
- `docs/api/tenant-import-flow.md`：按 `templateId` 筛选和导入前模板选择

原影响：

- 前端需要额外做字段映射
- 订单主字段与导入动作参数边界不清

原建议：

- 订单读模型和订单筛选统一为 `mappingTemplateId`
- 导入预检请求可保留 `templateId`，表示本次导入选择的模板
- 如短期保留 `OrderListQuery.templateId`，文档必须说明它筛选的是订单 `mappingTemplateId`

### P2-11 `PaymentAction.expiresAt` 语义冲突

状态：已完成

落地结果：

- `PaymentAction.expiresAt` 已统一解释为订单可发起支付的最大时间
- H5 查询返回值由订单进入系统时间和租户支付有效期计算，不再返回单次第三方收银台尝试过期时间
- `contracts`、Swagger 与 `docs/api/h5-api-doc.md` 已同步该语义

原问题：

contract 写 `expiresAt` 是当前支付尝试过期时间，无有效尝试时为 `null`；H5 文档又写它也可能是订单支付有效期边界

原始证据：

- `packages/types/src/contracts/payment.ts`：`expiresAt` 为当前支付尝试过期时间
- `docs/api/h5-api-doc.md`：`expiresAt` 同时被描述为收银台有效截止时间和订单支付有效期边界

原影响：

- 没有在线支付尝试但订单仍在二维码有效期内时，前端不知道是否应显示倒计时
- 订单支付有效期与单次收银台有效期混淆

原建议：

- 推荐拆分 `attemptExpiresAt` 与 `orderPaymentExpiresAt`
- 如果不改字段，文档应回到 contract 语义，只表示当前支付尝试过期时间
- 订单支付有效期应另有字段或仅通过 `statusMessage` 表达

### P2-12 金额字段传输类型不统一

状态：已裁决，暂不改代码

当前裁决：

- 普通展示、列表、汇总和前端筛选金额字段默认继续使用 `number`，单位为元
- 支付发起、支付网关、回调结算、入账核算等高风险支付链路允许使用 decimal string，单位仍为元
- `InitiatePaymentResponse.payableAmount` 属于服务端算定的本次定额支付金额，保留 `string`，字段注释已明确为“元单位字符串”
- `docs/api/api-architecture-overview.md` 已补充金额传输约定，避免后续把 `payableAmount: string` 误判为漂移

原问题：

大多数金额字段使用 `number`，但 `InitiatePaymentResponse.payableAmount` 使用 `string`，此前缺少全局传输规范说明

原始证据：

- `packages/types/src/contracts/order.ts`：订单金额字段多为 `number`
- `packages/types/src/contracts/payment.ts`：H5 详情金额为 `number`
- `packages/types/src/contracts/payment.ts`：`InitiatePaymentResponse.payableAmount` 为 `string`
- `packages/types/src/contracts/payment.ts`：流水金额为 `number`

当前影响判断：

- 当前不需要为了统一类型大范围修改订单、支付、财务和前端合同
- 支付链路金额正确性由服务端 Decimal 核算和 `payableAmount` decimal string 保障
- 后续新增金额字段必须按全局金额传输约定选择 `number` 或 decimal string，并在字段注释中写清单位和格式

### P3-13 `creditReminderDays` 与 `creditRemindDays` 命名并存

状态：已完成

落地结果：

- 已统一使用 `creditRemindDays` 表示账期到期提醒提前天数
- `TenantProfile.creditReminderDays` 已改为 `TenantProfile.creditRemindDays`
- `packages/types/src/contracts/tenant.ts`、`apps/api/src/tenant/mapping/tenant.mapper.ts`、`apps/api/src/tenant/tenant.swagger.ts` 已同步
- `static_alias/packages/types/src/contracts/tenant.ts` 与 Tenant mock 已同步
- 通用设置、订单账期提醒计算和文档原本已使用 `creditRemindDays`，保持不变

原问题：

通用设置和文档使用 `creditRemindDays`，Tenant profile 使用 `creditReminderDays`

原始证据：

- `docs/api/tenant-api-doc.md`：使用 `creditRemindDays`
- `docs/api/tenant-settings.md`：使用 `creditRemindDays`
- `packages/types/src/contracts/settings.ts`：`TenantGeneralSettings` 使用 `creditRemindDays`
- `packages/types/src/contracts/tenant.ts`：`TenantProfile` 曾使用 `creditReminderDays`

原影响：

- 前端在主体资料和通用设置之间复用字段困难
- 两者是否同义不明确

原建议：

- 推荐统一为 `creditRemindDays`
- 若两个字段不是同义，应在文档明确一个是主体默认值，一个是租户通用设置覆盖值

### P3-14 远景规划 contracts 被主入口导出

状态：已降级，暂缓改造

当前裁决：

- 当前优先完成 Tenant 端主链路，远景规划 contracts 导出不进入本轮整改
- `docs/api/admin-api-doc.md` 仍是规划接口是否可作为当前事实源的裁决入口
- 前端和后端当前联调不得把 `/billing/* / security/* / ops/* / service-providers/*` 当作已落地接口
- 暂不调整 `packages/types` 主入口导出，避免在当前阶段扩大非主线改动面

原问题：

Admin 文档明确远景规划不作为当前联调、Swagger 或 contracts 事实源，但 `packages/types` 仍统一导出规划 contracts

原始证据：

- `docs/api/admin-api-doc.md`：`/billing/* / security/* / ops/* / service-providers/*` 为远景规划
- `packages/types/src/contracts/index.ts`：导出 `agent / billing / ops / security`
- `packages/types/src/enums/index.ts`：导出 `billing / ops`

当前影响判断：

- 对当前 Tenant 端优先交付无直接阻塞
- 风险主要是未来前端误把规划域 contracts 当作已实现接口消费
- 当前通过文档裁决约束，不做代码层移除

后续触发条件：

- Admin 端开始收敛规划域接口边界
- 前端实际引用规划域 contracts 并造成联调误用
- `packages/types` 需要拆分 current / planned / archived 命名空间

后续建议：

- 从主 `contracts/index.ts` 移除规划域导出
- 从主 `enums/index.ts` 移除纯规划域枚举导出
- 如需保留源码，迁入 `planned` 或 `archived` 命名空间

## 5. 建议实施批次

### T01 支付与 H5 状态语义收敛

范围：

- `docs/api/h5-api-doc.md`
- `docs/api/api-architecture-overview.md`
- `docs/api/admin-api-doc.md`
- `docs/api/tenant-finance.md`
- `packages/types/src/contracts/payment.ts`
- `packages/types/src/enums/payment.ts`

目标：

- 区分 `OrderStatus` 与 `PaymentOrderStatus`
- 补齐租户状态对 H5 支付的裁决
- 拆清在线支付和线下登记动作裁决
- 明确 `cash / other_paid` 的 Tenant 确认模型（已完成 P1-04）

验证结果：

- `pnpm -F @shou/types build` 通过
- `pnpm -F api build` 通过
- `pnpm -C static_alias -F h5 build` 通过
- `git diff --check` 通过
- `pnpm -C static_alias -F tenant build` 仍被既有订单/账期类型问题阻断，失败点不属于 T01

### T02 Admin / Tenant 用户与租户合同收敛

范围：

- `docs/api/admin-api-doc.md`
- `docs/api/tenant-api-doc.md`
- `docs/api/tenant-settings.md`
- `packages/types/src/contracts/tenant.ts`
- `packages/types/src/contracts/settings.ts`
- `packages/types/src/contracts/auth.ts`
- `packages/types/src/enums/tenant.ts`

目标：

- P1-05 已降级：当前 OS/Admin 无权限体系，暂不改造 Admin 用户合同
- P1-06 已降级：Tenant 用户状态继续以 `UserSimpleStatus` 为当前事实源，Admin 完整 `UserStatus` 暂不纳入本轮
- 移除或收紧 `CreateTenantRequest.channel`
- 补齐资质审核 `rejectReason`

建议验证：

- `pnpm -F @shou/types build`
- 若改 API DTO，再执行 `pnpm -F api build`

### T03 命名收敛与规划 contracts 治理

范围：

- `docs/api/tenant-orders.md`
- `docs/api/tenant-import-flow.md`
- `docs/api/tenant-settings.md`
- `packages/types/src/contracts/order.ts`
- `packages/types/src/contracts/tenant.ts`
- `packages/types/src/contracts/index.ts`
- `packages/types/src/enums/index.ts`

目标：

- 统一 `customerFieldValues`
- 明确 `templateId / mappingTemplateId` 边界
- 统一 `creditRemindDays`
- 规划域 contracts 不从当前主入口导出

建议验证：

- `pnpm -F @shou/types build`
- `git diff --cached --check`

## 6. 当前非目标

以下事项不建议混入本次整改批次：

- 不重建 `packages/types/src/types`
- 不恢复旧 `/print/jobs`
- 不恢复 `erpOrderNo`、旧 `payStatus` 主流程或旧 `customFields`
- 不为远景规划接口补实现
- 不为了整理文档再次拆分 `tenant-credit.md` 或 `tenant-analytics.md`

## 7. 推荐优先级

1. 先处理 P0 和 P1 中支付/H5 状态问题
2. 再处理 Admin / Tenant 用户与 RBAC 问题
3. 再处理订单字段命名和租户创建合同
4. 最后处理金额传输规范、账期命名和规划 contracts 导出
