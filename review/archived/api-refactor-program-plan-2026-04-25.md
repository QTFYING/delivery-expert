# API 核心域改造总控计划（2026-04-25）

> 文档状态：历史总控计划，已归档

## 1. 文档定位

本文件用于把以下三份评审文件统一成一份可执行、可排期、可拆分提交的总控计划：

1. `review/reports/api-review-2026-04-23.md`
2. `review/reports/api-review-2026-04-24-code-quality-6-types.md`
3. `review/plans/import-revamp-plan.md`

本文件不是单条问题清单的复制粘贴，而是站在全局视角，对“订单、支付、导入、平台治理”四条主线做统一排程。

本文档的使用目标：

- 让后续任何 AI 或开发者都能快速理解这次改造的总目标、主路径和依赖关系
- 让每次修改都控制在一个完整的小功能内，便于独立提交、独立验收、独立回滚
- 避免“一次改一大坨”导致评审困难、回滚困难、回归风险失控

## 2. 总体判断

三份文件指向的并不是三个独立项目，而是同一个系统性问题的三个切面：

- 第一份强调“钱”和“状态”链路的真实事故风险
- 第二份强调这些问题为什么会反复发生，即规则散落、职责漂移、运行时边界不清
- 第三份强调导入链路已经到了必须升级执行模型的阶段

因此，这次改造不能按“支付修一点、导入修一点、代码味道再顺手修一点”推进，而应按以下总目标推进：

1. 先止血：先关掉会直接造成资金、状态、资源争抢事故的窗口
2. 再收口领域真相：统一订单状态、入账路径和导入落单语义
3. 再换代引擎：升级导入执行模型，而不是继续堆补丁
4. 最后收工程债：把重复代码、巨型 service、日志/审计等治理问题系统处理

## 3. 改造总目标

### 3.1 业务目标

- 资金链路只能有一套真相，不能再让 `orders.paid`、`payments`、支付单状态互相打架
- 订单状态只能由统一领域规则推导，不能让手工建单、支付、回款、导入各自产生状态
- 账期单不能继续误入 H5 支付主链路
- 导入链路要具备一致性、限流、恢复性和长期扩展能力

### 3.2 工程目标

- API 进程与 Worker 进程必须有清晰的运行时资源边界
- 每次提交都应是完整小功能，能单独上线、单独回滚
- 每条主链路至少有对应的验证方式，不能继续只靠人工阅读保证正确性

### 3.3 非目标

- 本轮不以“目录看起来更像标准 monorepo”为首要目标
- 本轮不在没有指标支撑的前提下强推全异步预检
- 本轮不允许以简单 `upsert` 或大事务批量写入取代业务规则分流

## 4. 施工原则

### 4.1 小步提交原则

每次提交必须满足以下要求：

- 只解决一个清晰问题，或只引入一个完整能力
- 改动范围尽量控制在 1 个主模块 + 必要的 contract/doc 同步
- 不把多个高风险行为改动塞进同一提交
- 提交后系统语义是自洽的，不依赖后续提交才能“补完整”

### 4.2 单次提交边界建议

建议每次提交控制在以下范围：

- 1 个主问题
- 1 个主要业务模块
- 1 组对应的 contract / doc 同步
- 1 组对应验证

不建议出现以下提交形态：

- 同时改 webhook、导入、权限三条主链路
- 同时做结构重构和业务改义
- 同时清理大量代码味道并顺带改动关键业务规则

### 4.3 提交完成标准

每次提交至少应包含：

1. 行为改动
2. 必要的契约/文档同步
3. 对应验证
4. 回滚边界说明

## 5. 总体施工顺序

建议固定按以下四个阶段推进：

1. Phase A：止血层
2. Phase B：领域收口层
3. Phase C：导入引擎换代层
4. Phase D：平台治理与工程收尾层

其中：

- Phase A 和 Phase B 是必须先完成的主路径
- Phase C 建立在 Phase A/B 之上
- Phase D 可以部分并行，但不能抢占主路径资源

## 6. 分阶段总规划

### Phase A：止血层

目标：

- 先关掉真实事故窗口
- 先防止钱、状态、资源隔离继续恶化

包含主题：

- webhook 状态边界与金额一致性
- 现金核销幂等
- 账期回款幂等
- 导入同租户活动任务约束
- 同步预检全局并发限制
- API / Worker 连接池隔离
- 公网端点限流

### Phase B：领域收口层

目标：

- 建立统一订单状态规则
- 建立统一入账真相
- 清理会误导调用方的旧 contract 残留

包含主题：

- 禁止普通订单接口直接写 `paid` / `status`
- 统一订单状态推导
- 导入、支付、回款统一复用状态规则
- 账期单/H5 支付边界收口

### Phase C：导入引擎换代层

目标：

- 把导入链路从“能跑”升级为“可扩展、可恢复、可观测”

包含主题：

- stale/锁/heartbeat 一致性
- chunk 预读分流执行
- `progressPercent`
- 主动放弃预检
- `snapshot` 降级与执行表切割

### Phase D：平台治理与工程收尾层

目标：

- 降低长期维护成本
- 修补平台治理和工程基础设施

包含主题：

- 默认密码/强制改密闭环
- 催款提醒真实通知
- 统一日志方案
- 统一审计日志服务
- 重复 helper 清理
- 巨型 service 拆分

## 7. 建议拆分成的可提交小任务

下面的任务清单按推荐顺序排列。每个任务都应尽量做成单独 commit 或单独 PR 的最小完整单元。

### T01：正式导入活动任务从“同用户”改为“同租户”

目标：

- 只修正正式导入活动任务的一致性维度，不误伤预检入口

建议改动范围：

- `apps/api/src/import/import.service.ts`
- `apps/api/src/import/import-job-runner.service.ts`
- `docs/api/tenant-api-doc.md`
- `docs/api/api-architecture-overview.md`
- `review/plans/import-revamp-plan.md` 或对应专项文档

提交完成标准：

- 同租户不同用户不能同时发起两个活动导入任务
- 租户存在活动导入任务时，`/import/preview` 仍允许继续执行
- 错误提示不再使用“当前用户已有任务进行中”语义

不应顺带做：

- 不在本提交中修改预检锁维度
- 不在本提交中改活动导入占位 TTL
- 不在本提交中引入全局预检并发控制
- 不在本提交中改 chunk 执行模型

建议提交标题：

- `fix(import): enforce tenant-scoped active import job`

### T02：重构活动导入占位 TTL 与续期机制

目标：

- 缩短异常卡死后的恢复时间，同时避免长任务执行中锁提前失效

建议改动范围：

- `apps/api/src/import/import-job-runner.service.ts`
- `apps/api/src/import/import.service.ts`
- `apps/api/src/config/import.config.ts`
- `apps/api/.env.example`
- `docs/api/api-architecture-overview.md`
- `review/plans/import-revamp-plan.md` 或对应专项文档

提交完成标准：

- 活动导入占位 TTL 改为可配置，不再把 `24h` 写死在实现里
- 长任务执行期间占位会稳定续期，不会因为 TTL 过短误放第二个导入任务
- 提交失败、任务完成、任务失败三条路径都能显式清理占位
- 进程异常退出后，租户占位能在可接受窗口内自动恢复

不应顺带做：

- 不在本提交中修改预检锁维度
- 不在本提交中增加全局预检并发令牌
- 不在本提交中重构正式导入执行模型

建议提交标题：

- `refactor(import): make active job ttl renewable and configurable`

### T03：为同步预检增加全局并发令牌

目标：

- 给主 API 进程增加最基本的内存/CPU 准入控制

建议改动范围：

- `apps/api/src/import/import.service.ts`
- `apps/api/src/redis/redis.service.ts`
- `apps/api/src/config/import.config.ts`
- `apps/api/src/import/import.constants.ts`
- `apps/api/.env.example`
- `docs/api/tenant-api-doc.md`

提交完成标准：

- 可配置全局并发上限
- 超过并发上限时明确拒载，而不是继续接收预检
- 令牌释放路径清晰，异常分支不漏释放

不应顺带做：

- 不在此提交中引入异步预检
- 不在此提交中修改正式导入

建议提交标题：

- `feat(import): add global preview concurrency limiter`

### T04：拆分 API / Worker Prisma 连接池

目标：

- 建立最基本的运行时数据库资源隔离

建议改动范围：

- `apps/api/src/prisma/prisma.service.ts`
- `apps/api/src/prisma/prisma.module.ts`
- `apps/api/src/import/import-worker.module.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/config/env.validation.ts`
- `apps/api/.env.example`
- `README.md`
- `docs/deployment/*.md`

提交完成标准：

- API / Worker 允许使用不同连接池预算
- 文档能说明两套连接池配置如何生效

不应顺带做：

- 不在此提交中重构目录到新的 `apps/import-worker`
- 不在此提交中引入队列系统

建议提交标题：

- `feat(runtime): isolate prisma pools for api and worker`

### T05：为公网高频端点补限流

目标：

- 给登录、H5、Webhook 等端点补上基础防滥用能力

建议改动范围：

- `apps/api/package.json`
- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/payment/payment.controller.ts`
- 新增限流模块或守卫
- `docs/api/tenant-api-doc.md`

提交完成标准：

- 登录、刷新、H5 查询、H5 发起支付、Webhook 都有明确限流策略

不应顺带做：

- 不在此提交中同时处理默认密码问题

建议提交标题：

- `feat(security): add throttling for public endpoints`

### T06：收紧 webhook 成功回调状态边界

目标：

- 禁止过期支付单的晚到成功回调再次入账

建议改动范围：

- `apps/api/src/payment/payment-webhook.service.ts`
- `apps/api/src/payment/payment-query.service.ts`
- 对应支付测试

提交完成标准：

- webhook 只允许合法状态迁移入账
- `EXPIRED` 等非法前置状态不会再次入账

不应顺带做：

- 不在此提交中同时重构整个支付模块

建议提交标题：

- `fix(payment): reject late success callback for expired payment orders`

### T07：补齐 webhook 金额一致性校验

目标：

- 让支付回调不仅看支付单金额，还校验订单剩余应付边界

建议改动范围：

- `apps/api/src/payment/payment-webhook.service.ts`
- 必要时 `apps/api/src/payment/payment-ledger.service.ts`
- 对应支付测试

提交完成标准：

- 金额异常的回调不会入账
- 合法重复回调仍保持幂等

建议提交标题：

- `fix(payment): enforce webhook amount consistency before ledger apply`

### T08：现金核销改为条件更新 + 幂等收口

目标：

- 让同一笔现金核销并发提交只成功一次

建议改动范围：

- `apps/api/src/payment/*`
- 对应支付测试

提交完成标准：

- 仅允许 `pending_verification` -> 已核销 的一次性迁移
- 不会新增第二条相同语义的支付流水

建议提交标题：

- `fix(payment): make cash verification idempotent`

### T09：账期回款增加幂等语义

目标：

- 防止重复点击/重试生成重复回款流水

建议改动范围：

- `apps/api/src/order/order-finance.service.ts`
- `apps/api/src/order/dto/create-order-receipt.dto.ts`
- `packages/types/src/contracts/order.ts`
- 对应测试

提交完成标准：

- 同一回款请求不会重复入账
- 契约能表达幂等语义或请求锚点

建议提交标题：

- `feat(order): add idempotency for credit receipt`

### T10：禁止普通订单接口直接写 `paid` / `status`

目标：

- 把“收款动作”和“订单编辑动作”彻底分开

建议改动范围：

- `packages/types/src/contracts/order.ts`
- `apps/api/src/order/dto/create-order.dto.ts`
- `apps/api/src/order/dto/update-order.dto.ts`
- `apps/api/src/order/order.service.ts`
- `docs/api/tenant-api-doc.md`

提交完成标准：

- 普通建单/改单接口不能再直接写 `paid` / `status`
- 文档、contract、DTO、实现完全一致

不应顺带做：

- 不在本提交中同时处理账期单 H5 边界

建议提交标题：

- `refactor(order): remove direct paid and status writes from order mutations`

### T11：统一订单状态推导并落到导入链路

目标：

- 建立唯一的订单状态推导源，并先让导入链路接入

建议改动范围：

- `apps/api/src/order/order.domain.ts`
- `apps/api/src/import/import-job-runner.service.ts`
- `apps/api/src/payment/payment-ledger.service.ts`
- 相关测试

提交完成标准：

- 导入创建/覆盖订单不再硬写 `PENDING`
- `payType=credit` 的导入订单状态正确
- 至少导入链路与支付台账链路复用同一规则源

建议提交标题：

- `refactor(order): unify order status derivation for import and ledger`

### T12：封堵账期单 H5 支付边界

目标：

- 防止账期单继续被 H5 端视为可支付订单

建议改动范围：

- `apps/api/src/payment/payment.domain.ts`
- `apps/api/src/payment/payment-operation.service.ts`
- `docs/api/h5-api-doc.md`
- `docs/api/tenant-api-doc.md`

提交完成标准：

- 账期单不会再被 H5 状态推导成 `unpaid`
- 账期单不能发起线上支付或线下登记支付

建议提交标题：

- `fix(payment): block credit orders from h5 payment flows`

### T13：统一导入锁、stale 与 heartbeat 语义

目标：

- 修正“数据库已 stale，但 Redis 锁还活着”的不一致问题

建议改动范围：

- `apps/api/src/import/import-job-runner.service.ts`
- `apps/api/src/redis/redis.service.ts`
- `apps/api/src/config/import.config.ts`

提交完成标准：

- heartbeat 会同步续租执行锁，或 stale / lock 策略能保持一致
- worker 异常退出后，任务能在预期窗口内重新拾起

建议提交标题：

- `fix(import): align heartbeat stale detection and execution lock ttl`

### T14：任务查询增加 `progressPercent`

目标：

- 让任务状态查询直接返回前端可用进度

建议改动范围：

- `packages/types/src/contracts/order.ts`
- `apps/api/src/import/import.service.ts`
- `apps/api/src/import/import.swagger.ts`
- `docs/api/tenant-api-doc.md`

提交完成标准：

- 查询接口直接返回 `progressPercent`
- 文档、swagger、contract 同步

建议提交标题：

- `feat(import): expose progress percent on import job query`

### T15：增加“放弃预检 / 放弃并重传”接口

目标：

- 给用户和前端一个主动释放预检快照与锁的正规路径

建议改动范围：

- `apps/api/src/import/import.controller.ts`
- `apps/api/src/import/import.service.ts`
- `packages/types/src/contracts/order.ts`
- `docs/api/tenant-api-doc.md`

提交完成标准：

- 存在显式取消/放弃预检接口
- 能正确释放预检快照与相关锁

建议提交标题：

- `feat(import): add abandon preview endpoint`

### T16：正式导入升级为 chunk 预读分流执行

目标：

- 在不破坏业务语义的前提下，大幅降低导入数据库往返次数

建议改动范围：

- `apps/api/src/import/import-job-runner.service.ts`
- `apps/api/src/import/import-job.worker.helpers.ts`
- `apps/api/src/import/import.types.ts`
- 相关测试

提交完成标准：

- 导入执行从逐单事务改为按 chunk 预读后分流提交
- 保持现有 `create / overwrite / skip / reject` 业务语义
- 不能用简单 `upsert` 替代业务分流

不应顺带做：

- 不在同一提交中同时引入执行表

建议提交标题：

- `refactor(import): process import jobs by chunked prefetch and apply`

### T17：将 `snapshot` 从执行载体降级为审计快照

目标：

- 为真正的流式执行做数据层准备

建议改动范围：

- `apps/api/prisma/schema.prisma`
- `docs/prisma/data-model-reference.md`
- `apps/api/src/import/*`
- `packages/types/src/contracts/order.ts`
- `docs/api/tenant-api-doc.md`

提交完成标准：

- 引入执行表，如 `import_job_items`
- 新任务执行不再依赖整块 `snapshot.orders`
- `snapshot` 明确保留为审计快照

建议提交标题：

- `feat(import): add execution items and downgrade snapshot to audit payload`

### T18：默认密码与强制改密闭环

目标：

- 解决“默认密码存在，但强制改密字段没有闭环”的平台治理问题

建议改动范围：

- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/tenant/*`
- `apps/api/src/settings/settings-user.service.ts`
- `apps/api/prisma/schema.prisma`
- 必要文档

提交完成标准：

- `requiresPasswordReset` 登录链路生效
- 改密后会清除标记
- 登录成功会写 `loginAt`

建议提交标题：

- `fix(auth): close password reset and loginAt lifecycle`

### T19：催款提醒真正触发通知

目标：

- 让“创建提醒”与“触发通知渠道”的对外语义一致

建议改动范围：

- `apps/api/src/order/order-finance.service.ts`
- `apps/api/src/notification/notification.service.ts`
- `docs/api/tenant-api-doc.md`

提交完成标准：

- 创建提醒后存在明确通知派发行为
- 若当前渠道能力不足，至少要把接口语义改清楚，不能继续假装已发送

建议提交标题：

- `feat(notification): dispatch reminder notifications on order reminder creation`

### T20：统一日志方案

目标：

- 建立统一结构化日志基座，服务后续导入与支付监控

建议改动范围：

- `apps/api/package.json`
- `apps/api/src/main.ts`
- `apps/api/src/common/*`
- `apps/api/src/payment/*`
- `apps/api/src/import/*`

提交完成标准：

- 不再混用 `console.error`、零散 `Logger`、手工 `[AUDIT]` 文本
- 至少支付和导入链路有统一结构化日志出口

建议提交标题：

- `chore(logging): standardize structured logging for payment and import flows`

### T21：统一审计日志服务

目标：

- 把分散 helper 和直写审计逻辑收口成统一服务

建议改动范围：

- `apps/api/src/settings/settings.shared.ts`
- `apps/api/src/tenant/tenant.shared.ts`
- `apps/api/src/order/*`
- 新增统一 `AuditLogService`

提交完成标准：

- 新增统一审计日志服务
- 新代码不再直接散落 `auditLog.create()` 与多份 helper

建议提交标题：

- `refactor(audit): introduce unified audit log service`

## 8. 主路径与并行建议

### 8.1 必须串行的主路径

建议严格串行推进：

1. `T01`
2. `T02`
3. `T03`
4. `T04`
5. `T06`
6. `T07`
7. `T08`
8. `T09`
9. `T10`
10. `T11`
11. `T12`
12. `T13`
13. `T16`
14. `T17`

原因：

- 这条主路径决定了系统能否先止血、再统一领域真相、再升级导入引擎

### 8.2 可并行支线

以下任务可在主路径间隙并行推进：

- `T05` 公开端点限流
- `T14` 任务进度字段
- `T15` 放弃预检接口
- `T18` 默认密码闭环
- `T19` 催款提醒通知
- `T20` 统一日志
- `T21` 统一审计日志

但并行支线不能阻塞主路径上线。

## 9. 每个阶段的里程碑定义

### 里程碑 M1：系统止血完成

满足以下条件即可视为 M1 完成：

- webhook 不再接受非法状态回调入账
- 现金核销与账期回款具备幂等能力
- 同租户导入活动任务约束已落地
- 同步预检存在全局并发上限
- API / Worker 连接池已隔离

### 里程碑 M2：领域真相收口完成

满足以下条件即可视为 M2 完成：

- 普通订单接口不能直接写 `paid/status`
- 订单状态推导存在统一规则源
- 导入与支付链路复用该规则
- 账期单不会再进入 H5 支付链路

### 里程碑 M3：导入执行引擎升级完成

满足以下条件即可视为 M3 完成：

- stale/锁/heartbeat 语义一致
- 导入执行改为 chunk 分流模型
- 任务查询包含显式进度百分比
- 用户可以主动放弃预检

### 里程碑 M4：导入执行载体换代完成

满足以下条件即可视为 M4 完成：

- `snapshot` 不再承担长期执行载体角色
- 执行表已落地
- 新导入任务可按原生分页方式分批读取

### 里程碑 M5：平台治理收尾完成

满足以下条件即可视为 M5 完成：

- 默认密码治理闭环生效
- 催款提醒语义与真实行为一致
- 日志和审计至少在支付与导入主链路统一

## 10. 施工前检查清单

后续任何 AI 在开始实现前，都应先回答以下问题：

1. 当前任务属于哪个阶段？
2. 当前提交是否只解决一个完整问题？
3. 当前提交是否会影响对外契约？
4. 当前提交需要同步哪些文档和 contract？
5. 当前提交能否单独回滚？
6. 当前提交是否会与主路径上的其他任务产生交叉写入？

若以上问题无法明确回答，不应直接动手改代码。

## 11. 风险提醒

### 11.1 最容易做错的地方

- 先拆目录、后修业务真相
- 先追求批量写入性能、后补业务分流
- 把“同租户单活动任务”错误实现成“同用户单活动任务”
- 在一个提交里同时改动支付、导入、权限和日志
- 还没统一状态规则就先上执行表

### 11.2 建议的回滚策略

- `T01` ~ `T15` 应保证基本都能独立回滚
- `T16` 应使用明确 feature flag 或明确分支保护
- `T17` 涉及 schema 与执行载体切换，必须准备兼容期或双轨方案

## 12. 结论

这次改造的正确顺序不是“看到哪里不顺眼就修哪里”，而是：

1. 先止血
2. 再统一领域真相
3. 再换代引擎
4. 最后收工程债

同时，执行层面必须坚持“小功能、独立提交、独立验收、独立回滚”的原则。

如果后续严格按本文拆分推进，那么每次提交都能成为一个完整的小功能，而不是“攒一大坨再一起改”。
