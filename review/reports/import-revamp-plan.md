# 订单预检与导入改造施工方案

## 1. 文档定位

本文件是导入链路后续改造的专项施工蓝图，供人类开发者与其他 AI 共同使用。

本文档的目标不是只记录某一轮讨论结论，而是统一以下内容：

- 当前对外契约与当前代码基线
- 建议的源码查阅入口与阅读顺序
- 已确认的风险、约束与非目标
- 分阶段改造规划、阶段边界与验收口径
- 远景目标与是否需要异步预检的判断标准

涉及 `/import/*`、`/orders/import*`、导入任务执行模型、导入快照、导入任务状态机时，应先读本文，再同步：

1. `docs/api/tenant-api-doc.md`
2. `docs/api/api-architecture-overview.md`
3. `packages/types/src/enums`
4. `packages/types/src/contracts`
5. `docs/enums/enum-manual.md`
6. `docs/prisma/data-model-reference.md`
7. `apps/api/prisma/schema.prisma`

## 2. 当前确认口径

### 2.1 当前外部产品契约

在本轮改造的 Phase 1 ~ Phase 4 中，默认保留以下外部产品契约：

- `POST /import/preview` 仍为同步预检接口
- `POST /orders/import` 仍为异步正式导入接口
- 前端正式导入时只传 `previewId` 与 `conflictPolicy?`，不回传原始订单数组
- 预检成功后返回 `previewId`
- 正式导入成功创建 `jobId` 后，通过 `GET /orders/import/jobs/:jobId` 轮询进度

### 2.2 当前不立即推进的事项

以下事项不是本轮改造的第一优先级：

- 不立即把预检整体改成异步 worker
- 不立即把导入链路整体改造成 Bull/BullMQ 队列模型
- 不立即为了目录形态把当前仓库硬拆成新的 `apps/import-worker`
- 不立即彻底移除 `import_jobs.snapshot`

### 2.3 当前优先级最高的改造目标

优先级从高到低如下：

1. 先保住主 API 进程的内存与事件循环安全
2. 先补齐同租户导入一致性约束
3. 先隔离 API / Worker 的数据库连接资源
4. 再把正式导入从逐单事务升级为 chunk 分流执行
5. 最后再决定是否需要异步预检

## 3. 当前基线

### 3.1 当前实现骨架

当前实现已经具备以下骨架：

- API 进程负责同步预检、正式导入受理、导入任务查询
- Worker 进程已有独立启动入口，但复用同一套导入模块实现
- 预检快照先短暂缓存在 Redis
- 正式导入创建 `import_job` 后，把快照持久化到 `import_jobs.snapshot`
- Worker 通过轮询 `import_jobs` 表拉起待执行任务
- 导入任务当前按“逐单事务”串行执行

### 3.2 当前代码入口

其他 AI 在动手改导入链路前，建议按以下顺序阅读：

1. `review/plans/import-revamp-plan.md`
2. `docs/api/tenant-api-doc.md`
3. `docs/api/api-architecture-overview.md`
4. `packages/types/src/enums/order.ts`
5. `packages/types/src/contracts/order.ts`
6. `apps/api/prisma/schema.prisma`
7. `apps/api/src/main.ts`
8. `apps/api/src/import/import-template.controller.ts`
9. `apps/api/src/import/import-job.controller.ts`
10. `apps/api/src/import/import-preview.service.ts`
11. `apps/api/src/import/import-submit.service.ts`
12. `apps/api/src/import/import-job-query.service.ts`
13. `apps/api/src/import/import.normalizer.ts`
14. `apps/api/src/import/import-job-runner.service.ts`
15. `apps/api/src/import/import-worker.module.ts`
16. `apps/api/src/import/import.module.ts`
17. `apps/api/src/config/import.config.ts`
18. `apps/api/src/prisma/prisma.service.ts`

### 3.3 当前关键文件职责

- `apps/api/src/import/import-preview.service.ts`
  负责同步预检、模板约束、批次去重和预检快照写入 Redis。
- `apps/api/src/import/import-submit.service.ts`
  负责消费 `previewId` 创建 `import_job`，收口正式提交时的锁、活动任务槽位和建单逻辑。
- `apps/api/src/import/import-job-query.service.ts`
  负责读取租户侧导入任务结果，并将 `importJob.snapshot` 投影为共享 contract。
- `apps/api/src/import/import.normalizer.ts`
  负责订单头、明细、自定义字段的规范化与预检基础校验。
- `apps/api/src/import/import-job-runner.service.ts`
  负责导入任务轮询、锁、心跳、正式落库、覆盖/跳过逻辑。
- `apps/api/src/import/import.types.ts`
  定义 `PreviewSnapshot`、`ImportJobProgress` 等内部类型。
- `apps/api/src/import/import.constants.ts`
  定义预检上限、body 大小等运行期常量。
- `apps/api/src/main.ts`
  定义 `/api/import/preview` 的大 body 路由级限制。
- `apps/api/prisma/schema.prisma`
  定义 `Tenant.importRevision` 与 `ImportJob` 数据模型。
- `packages/types/src/contracts/order.ts`
  定义预检、正式导入、任务查询的对外 contract。
- `packages/types/src/enums/order.ts`
  定义导入任务状态、冲突策略等闭集。

### 3.4 当前已经做得对的部分

- 预检与正式导入已经拆成两阶段，不再让正式导入直收原始数组
- 预检已具备单次 `5000` 订单、`50000` 明细、`20mb` body 限制
- 预检已使用批量查库的重复订单检测，不是循环单查
- 正式导入已使用 `Tenant.importRevision` 做旧 `previewId` 整体失效控制
- Redis 中的预检快照在成功创建 `jobId` 后会立即删除
- Worker 具备独立进程入口与基础心跳/锁模型

## 4. 当前主要问题

### 4.1 一致性问题

- 当前活动正式导入任务已收口为“同租户单活动任务”
- 当前活动预检约束仍是“同用户单活动任务”，不同用户仍可在同一租户下并发发起预检
- Phase 1 仍未完成，因为预检租户级单活动约束和全局预检并发控制尚未落地

### 4.2 运行时安全问题

- `/import/preview` 在主 API 进程内同步执行大 body 解析、全量对象构造、Map/Set 校验与批量查库
- 目前没有“全局预检并发令牌”这类内存/CPU 准入控制
- API 与 Worker 目前共用同一套 Prisma 客户端装配，尚未显式区分连接池预算
- 当前活动正式导入锁已切换为“短 TTL + 时间驱动续期 + compare-delete 清理”模型：
  - 占位 TTL 已配置化，默认 `900s`
  - 长任务执行期间按 `IMPORT_ACTIVE_JOB_TENANT_RENEW_INTERVAL_SECONDS` 做时间驱动续期，默认 `60s`
  - `pending / processing` 状态下会按数据库现状自愈回补 Redis 活动锁状态
  - 若 Redis 命中但数据库没有对应活动 `import_job`，会在短暂建单宽限窗后识别并清理“孤儿占位”
- 因此当前活动导入锁的主要剩余风险不再是“24h 假性占用”，而是后续仍需继续完成预检侧租户级锁与全局预检并发控制

### 4.3 正式导入执行效率问题

- 当前正式导入是逐单事务，不是按 chunk 分流处理
- 订单数上升后，数据库往返次数会明显放大
- 现有模型不适合继续提升单次导入规模上限

### 4.4 执行载体问题

- `import_jobs.snapshot` 当前同时承担“恢复快照”和“执行载体”双重角色
- 如果后续要真正实现流式分批读取，单个大 JSON 快照不适合作为长期执行 substrate

### 4.5 体验与可观测性问题

- 当前任务查询返回计数，但没有显式 `progressPercent`
- 当前没有“主动放弃预检 / 放弃并重传”的接口
- 当前缺少用于决定“是否要异步预检”的专项观测指标方案

### 4.6 业务正确性问题

导入链路除了性能问题，还存在业务语义问题；当前已知最重要的一条是：

- 导入创建/覆盖订单时仍把订单状态硬写为 `PENDING`
- 这会让 `payType=credit` 的账期单在导入链路里产生状态漂移

后续改造正式导入执行引擎时，必须同时修正该问题，复用统一订单状态推导规则。

## 5. 目标与非目标

### 5.1 本轮改造目标

本轮改造的目标是：

- 在不立刻推翻现有产品契约的前提下，先保证 API 稳定性
- 将导入一致性从“同用户”提升到“同租户”
- 将 API 与 Worker 的数据库资源隔离开
- 将正式导入执行模型升级为可扩展的 chunk 分流模型
- 为未来是否引入异步预检准备观测与架构条件

### 5.2 本轮非目标

本轮改造不是为了：

- 追求目录结构表面更漂亮
- 为了“工业级”口号而一次性引入过多基础设施
- 在没有监控与压测依据时强行改成异步预检
- 用简单 `createMany` / `upsert` 替代现有覆盖/拦截规则

## 6. 远景目标

导入链路的远景目标是：

- 小规模预检仍可保持快速同步反馈
- 大规模预检可按数据驱动切换到异步执行
- 正式导入执行载体不再依赖大 JSON 快照
- Worker 可按 chunk 真正流式读取、分流、提交
- `import_jobs.snapshot` 退化为审计快照、防篡改快照、问题复盘快照
- API / Worker 拥有清晰的运行时资源隔离、监控和扩缩容边界

## 7. 施工原则

后续任何 AI 在实施时必须遵守以下原则：

- 不得声称“已做 chunking”，如果底层仍是整块读取大 JSON 再切片，只能称为“chunk 化执行逻辑”，不能称为“chunk 化读取”
- 不得用简单批量 `upsert` 绕过“已有支付/支付单禁止覆盖”等业务拦截
- 不得因为追求吞吐量，破坏 `importRevision` 的整体失效语义
- 不得为了局部性能，把 Redis 临时快照重新提升为唯一真相
- 在 Phase 5 之前，不得擅自改写“同步预检、异步正式导入”的外部契约
- 每完成一个 phase，都必须同步本文与相关事实源，不允许“代码先改完，文档以后再补”

## 8. 分阶段施工蓝图

### Phase 1：预检准入控制与租户级一致性

#### 目标

先解决 API 进程生存问题与租户级活动任务一致性问题。

#### 主要动作

- 将正式导入活动任务约束从“同用户”升级为“同租户”
- 明确预检活动槽位与正式导入活动槽位是两套独立约束
- 租户内存在活动正式导入任务时，仍允许继续预检；但正式提交 `/orders/import` 时仍受租户级活动导入槽位约束
- 为活动导入占位补齐“短 TTL + 续期 + 显式清理”机制
- 再将预检活动约束从“同用户”升级为“同租户”
- 为同步预检增加全局并发令牌或全局信号量
- 保留当前同步预检接口，但对超额并发直接拒载
- 明确 Redis key 维度：
  - 租户级预检锁
  - 租户级活动导入任务锁
  - 全局预检并发令牌

#### 当前实现现状

- 活动正式导入锁已从固定 `24h` 黑盒值切换为配置化短 TTL，当前默认 `900s`
- `PROCESSING` 阶段不再按“每处理一单就续一次”，而是按时间驱动续期，当前默认间隔 `60s`
- 活动正式导入锁状态已独立收口到 `ImportTenantJobStateService`
- 读取活动任务状态时，会同时核对数据库：
  - Redis 缺失时，按数据库中的活动 `import_job` 自愈回补
  - Redis 命中但数据库查不到活动任务时，会在短暂建单宽限窗后清理“孤儿占位”
- 本 phase 仍未完成，原因是预检侧仍是“同用户单活动预检”，且尚未引入全局预检并发令牌

#### 建议改动入口

- `apps/api/src/import/import-preview.service.ts`
- `apps/api/src/import/import-submit.service.ts`
- `apps/api/src/import/import-job-runner.service.ts`
- `apps/api/src/config/import.config.ts`
- `apps/api/src/import/import.constants.ts`
- `apps/api/src/redis/redis.service.ts`
- `docs/api/tenant-api-doc.md`
- `docs/api/api-architecture-overview.md`

#### 推荐配置项

- `IMPORT_PREVIEW_GLOBAL_CONCURRENCY`
- `IMPORT_PREVIEW_TENANT_LOCK_TTL_SECONDS`
- `IMPORT_ACTIVE_JOB_TENANT_TTL_SECONDS`

#### 建议拆分的小任务

建议把 Phase 1 再拆成以下 4 个独立提交单元，避免把“正式导入槽位、预检槽位、TTL、全局并发”混在一个提交里：

1. `P1-01`：正式导入活动任务从“同用户”改为“同租户”
   - 只修正 `/orders/import` 的活动任务占位维度
   - 不误把正式导入槽位扩散成“只要有人在导入就不能预检”
2. `P1-02`：活动导入占位 TTL 配置化，并引入续期机制
   - 不再把 `24h` 硬编码当成最终方案
   - 目标是“短 TTL + 续期 + 显式清理”，而不是单纯把数字改小
3. `P1-03`：预检活动任务从“同用户”改为“同租户”
   - 只收口 `/import/preview` 的租户级单活动预检语义
   - 不顺带修改正式导入执行引擎
4. `P1-04`：为同步预检增加全局并发令牌
   - 解决主 API 进程内存 / CPU 准入控制问题
   - 与租户级单活动预检是互补关系，不是替代关系

#### 验收标准

- 同一租户不同用户不能同时持有两个活动导入任务
- 租户内已有活动正式导入任务时，仍允许继续发起预检；但活动预检仍受独立租户级预检锁限制
- 活动导入占位不再依赖固定 `24h` 黑盒值；长任务执行期间可续期，异常中断后可在预期窗口内自动释放
- 同一租户不同用户不能同时发起两个活动预检
- 当全局预检并发达到上限时，服务端会明确拒载，而不是继续堆进 API 进程
- 导入相关错误提示改为租户级语义，而不是用户级语义

### Phase 2：API / Worker 数据库连接池物理隔离

#### 目标

确保 Worker 跑批时，不会直接吃光 API 的数据库连接预算。

#### 主要动作

- 为 API 与 Worker 使用两套独立 Prisma 实例装配
- 允许 API / Worker 使用不同的连接池上限
- 部署文档、环境变量模板同步表达这种运行时边界

#### 建议改动入口

- `apps/api/src/prisma/prisma.service.ts`
- `apps/api/src/prisma/prisma.module.ts`
- `apps/api/src/import/import-worker.module.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/config/env.validation.ts`
- `apps/api/.env.example`
- `docs/deployment/*.md`
- `README.md`

#### 设计说明

本 phase 的重点是运行时资源隔离，不要求当前就拆成新的 `apps/import-worker` 目录。

是否保持单仓双入口，不是核心问题；核心问题是：

- API 实例和 Worker 实例不能继续使用同一组连接池预算
- 后续压测和扩容必须能分别观测 API / Worker 的数据库压力

#### 验收标准

- API / Worker 各自拥有独立连接池预算
- Worker 压力测试不会直接拖死 API 的数据库连接可用性
- 配置和部署文档能明确区分两套运行参数

### Phase 3：正式导入执行引擎换代

#### 目标

在不破坏业务规则的前提下，把正式导入从“逐单事务”升级为“按 chunk 预读分流 -> 按 chunk 事务提交”。

#### 主要动作

- 废弃逐单事务模型
- 引入 `IMPORT_JOB_CHUNK_SIZE`
- 对每个 chunk 做批量预读：
  - 库内已有订单
  - 已有支付记录
  - 活跃支付单
- 在内存里把本批数据切分为：
  - `create`
  - `overwrite`
  - `skip`
  - `reject`
- 对可执行组按 chunk 开事务提交
- 任务进度改成按 chunk 提交后统一推进
- 同步修正导入链路中的订单状态推导，禁止继续把账期单硬写成 `PENDING`

#### 建议改动入口

- `apps/api/src/import/import-job-runner.service.ts`
- `apps/api/src/import/import-job.worker.helpers.ts`
- `apps/api/src/import/import.types.ts`
- `apps/api/src/import/mapping/import.mapper.ts`
- `apps/api/src/order/order.domain.ts`
- `packages/types/src/contracts/order.ts`
- `apps/api/src/import/import.swagger.ts`
- `docs/api/tenant-api-doc.md`

#### 关键约束

- 不允许用简单 `createMany` / `upsert` 取代业务分流
- `overwrite` 前仍必须校验是否存在已结算流转
- `payType=credit` 的订单必须复用统一订单状态推导，不得再硬编码 `PENDING`

#### 推荐新增返回字段

建议在任务查询 contract 中新增：

- `progressPercent`
- `lastError?`

#### 验收标准

- 导入任务不再按逐单事务执行
- chunk 级预读能显著减少数据库往返次数
- 现有覆盖/跳过/拦截语义保持不变
- 账期单导入不再写错状态
- 任务查询可以直接返回显式进度百分比

### Phase 4：快照降级与执行表切割

#### 目标

让 `import_jobs.snapshot` 退化为审计快照，不再作为长期执行载体。

#### 主要动作

- 新增执行表，例如 `import_job_items`
- 每一条预检通过订单形成一条可执行记录
- `import_job_items` 至少应承载：
  - `jobId`
  - `tenantId`
  - `itemIndex`
  - `sourceOrderNo`
  - 规范化后的 payload
  - 当前执行状态
  - 冲突结果 / 错误原因 / 已命中订单 ID
- `import_jobs.snapshot` 保留原始审计快照、预检摘要与防篡改快照职能
- Worker 后续执行基于 `import_job_items` 分批读取，而不是整块读取大快照

#### 建议改动入口

- `apps/api/prisma/schema.prisma`
- `docs/prisma/data-model-reference.md`
- `apps/api/src/import/import.service.ts`
- `apps/api/src/import/import-job-runner.service.ts`
- `apps/api/src/import/import.types.ts`
- `packages/types/src/enums/order.ts`
- `packages/types/src/contracts/order.ts`
- `docs/api/tenant-api-doc.md`
- `docs/api/api-architecture-overview.md`

#### 迁移策略

- 新建执行表后，新任务优先写入执行表
- `import_jobs.snapshot` 先保留，兼容旧任务恢复
- 旧任务读快照，新任务读执行表，允许存在一段并行过渡期

#### 验收标准

- 正式导入执行不再依赖整块 `snapshot.orders`
- Worker 可以按数据库原生分页方式分批拉取执行项
- `snapshot` 明确退化为审计快照而非执行 substrate

### Phase 5：基于指标决定是否异步化预检

#### 目标

让“是否异步预检”变成数据驱动决策，而不是意见之争。

#### 主要动作

- 对同步预检建立专项指标：
  - `/import/preview` 平均耗时、P95、P99
  - API 进程 RSS、堆内存、GC 暂停
  - 预检并发拒载次数
  - 同时段支付/H5 关键接口延迟
  - 导入预检订单规模分布
- 对正式导入建立专项指标：
  - chunk 吞吐量
  - 单任务总耗时
  - 失败率、重试率、冲突率

#### 决策原则

只有在完成 Phase 1 ~ Phase 4 后，若同步预检依然满足以下任一情况，才进入“异步预检方案设计”：

- 预检耗时显著损害前端体验
- API 进程在准入控制下仍存在明显 GC 或事件循环抖动
- 为保证 API 稳定性，不得不把同步预检并发限制到不可接受

#### 说明

是否异步预检是“未来可能的产品与架构演进”，不是当前已确认事实。

## 9. 给其他 AI 的施工步骤建议

后续其他 AI 接手本改造时，建议按以下流程推进：

1. 先读本文，确定当前所在 phase
2. 再读 `docs/api/tenant-api-doc.md` 与 `docs/api/api-architecture-overview.md` 中的导入章节
3. 再读 `packages/types/src/enums/order.ts` 与 `packages/types/src/contracts/order.ts`
4. 再读 `apps/api/prisma/schema.prisma`
5. 最后再看 `apps/api/src/import/*`

动手前必须先回答清楚以下问题：

- 当前改的是哪个 phase？
- 当前是否会影响外部契约？
- 当前是否需要同步 `docs/api`、`contracts`、`schema.prisma`？
- 当前是否会影响 `importRevision`、锁语义、冲突语义、状态推导？

若无法回答以上问题，不应直接开始改代码。

## 10. 风险清单

### 10.1 容易误判的风险

- 把“chunk 化执行逻辑”误说成“chunk 化读取”
- 把“连接池隔离”误做成只是新建一个 worker 启动命令
- 把“同租户单活动任务”误实现成“同用户单活动任务”
- 把“批量导入提速”误做成“无脑 `upsert`”
- 在导入性能改造时漏修账期单状态漂移

### 10.2 回滚边界

- Phase 1 与 Phase 2 可独立回滚
- Phase 3 必须以 feature flag 或明确的分支边界落地，避免一次性替换全部执行逻辑后难以回滚
- Phase 4 涉及 schema 与执行载体切换，必须设计双读/双写或兼容期，不能一次性切断旧任务恢复链路

## 11. 文档与实现同步清单

每推进一个 phase，都要检查以下同步项：

1. `review/plans/import-revamp-plan.md`
2. `docs/api/tenant-api-doc.md`
3. `docs/api/api-architecture-overview.md`
4. `packages/types/src/enums/order.ts`
5. `packages/types/src/contracts/order.ts`
6. `docs/enums/enum-manual.md`
7. `docs/prisma/data-model-reference.md`
8. `apps/api/prisma/schema.prisma`
9. `apps/api/.env.example`
10. `README.md`
11. `docs/deployment/*.md`

## 12. 当前建议的实施顺序

后续若按本方案推进，建议顺序固定为：

1. Phase 1：预检准入控制与租户级一致性
2. Phase 2：API / Worker 数据库连接池物理隔离
3. Phase 3：正式导入执行引擎换代
4. Phase 4：快照降级与执行表切割
5. Phase 5：基于指标决定是否异步化预检

不得跳过 Phase 1 和 Phase 2，直接进入大规模引擎重写。
