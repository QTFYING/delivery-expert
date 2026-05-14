# 仓库健康度与架构规范评审报告（2026-04-26）

> 本稿已根据后续代码改造同步更新，反映当前仓库现状，而非初稿生成时的历史快照。

## 1. 评审目的

本报告从仓库级视角评估当前项目的工程健康度，重点关注以下 8 个维度：

1. 结构规划合理性
2. 文件命名规范
3. 目录组织规范
4. 业务拆解规范
5. NestJS 框架使用规范
6. Swagger 契约文档健康度
7. Skills 治理体系成熟度
8. Test 测试体系成熟度

本次评审不以单点功能正确性为主，而是评估“这个仓库是否适合长期迭代、多人协作、持续重构和 AI 协同开发”。

## 2. 评审范围与方法

本次评审基于以下信息完成：

- 仓库根目录结构、workspace 装配方式、脚本与依赖声明
- `apps/api/src` 的模块装配层、控制器层、服务层、导入 Worker 装配方式
- `packages/types`、`packages/utils` 的共享层设计
- `docs/api`、`README.md`、`AGENTS.md` 与 `.codex/skills/*`
- 实际验证命令结果：
  - `pnpm build`
  - `pnpm lint`
  - `pnpm format:check`
  - `pnpm check:backend`

说明：

- 本报告强调“仓库级结构与治理质量”。
- 本报告包含真实验证结果，不以“理论上应该可以”代替实际结论。

## 3. 总体结论

### 总体评级

当前仓库可评为：**中上偏上，明显高于普通业务型 NestJS 后端仓库，且较本报告初稿时的结构状态更健康，但尚未达到优秀仓库标准。**

### 一句话判断

这个仓库最强的部分，不是“所有代码已经很优雅”，而是“治理意识已经成型”：

- 事实源顺序明确
- 文档与 contracts 有治理意识
- AI 协作规则已仓库化
- 核心高风险链路已有分层倾向

但距离“优秀仓库”还有三道明显门槛：

1. 测试链路已经回到绿色，但仍缺少结构化、可局部运行的分层测试体系
2. 模块边界已完成一轮集中清债，但 `import` 域、部分查询 service 与共享层策略仍未彻底收口
3. DTO / contracts / Swagger / docs 的多套并行维护成本仍然偏高

## 4. 维度评分

| 维度           | 评分   | 结论                                                                   |
| -------------- | ------ | ---------------------------------------------------------------------- |
| 结构规划合理性 | 7.5/10 | 轻量 monorepo 方案合理，API 与 Worker 共仓复用务实，角色边界已明显改善 |
| 文件命名规范   | 7.5/10 | 命名收敛度较初稿明显提升，但仍有少量历史命名残留                       |
| 目录组织规范   | 7.5/10 | `dto` / `mapping` / `gateway` / 角色侧边界都更清晰，但目录终局未完成   |
| 业务拆解规范   | 7.5/10 | `payment`、`tenant`、`order-print` 已完成一轮有效拆分，`import` 仍偏重 |
| NestJS 规范    | 8/10   | 全局装配、管道、过滤器、中间件使用成熟，入口层边界也比初稿更清楚       |
| Swagger 健康度 | 6.5/10 | 联调可用性不错，但维护成本偏高，尚未形成更强的单源收敛机制             |
| Skills 成熟度  | 8.5/10 | 仓库级 AI 协作规则非常有特色，且整体克制、贴合项目，不飘               |
| Test 成熟度    | 5.5/10 | smoke / regression / backend check 已回绿，但仍缺少结构化分层测试      |

## 5. 分维度评审

### 5.1 结构规划合理性

#### 优点

- 根目录使用 `apps/api + packages/types + packages/utils` 的轻量 workspace 结构，工程复杂度控制得比较好。
- 没有为了追求形式上的“大 monorepo”而引入大量无实际收益的层次，这是务实的。
- API 与导入 Worker 采用共享业务模块、分入口启动的思路，避免了过早物理拆仓。
- `ImportModule.register('api' | 'worker')` 这种动态装配方式说明当前架构在“复用”和“运行模式差异”之间做过取舍。

#### 风险

- API 与 Worker 当前仍复用同一套 `PrismaModule` 与 `RedisModule`，说明代码复用做到了，但运行时边界隔离还只是半完成态。
- 一旦正式导入任务压力上来，API 与 Worker 的资源竞争问题会继续放大。
- 结构上虽然不是错误，但距离“扩缩容边界清晰、运维独立性强”的优秀状态还有差距。

#### 判断

当前结构规划是**正确且务实的中期形态**，不是终局形态。

### 5.2 文件命名规范

#### 优点

- 大多数文件采用 kebab-case，整体可读性良好。
- NestJS 的类命名基本符合惯例，如 `*.controller.ts`、`*.service.ts`、`*.module.ts`。
- 新近拆分出的 `payment-h5.controller.ts`、`payment-webhook.controller.ts`、`payment-tenant.controller.ts`、`os-tenant-*.ts`、`tenant-self.controller.ts`，已经开始稳定表达“调用侧 + 资源/用例”的命名口径。
- `mapping`、`gateway`、`*.query.ts`、`*.validation.ts` 这类辅助分层命名方向是正确的。

#### 不足

- 仍有个别命名带历史痕迹，例如 `tenant-admin-user.service.ts`。
- `tenant` 域目前已引入 `os-*` 命名，但仍保留部分旧 `tenant-*` 语义命名，说明收敛方向已经明确，终局还未完全统一。

#### 判断

命名规范已经从“基本统一”进入“有明确收敛口径”的阶段，但还没有完全达到“团队一看文件名就知道边界”的优秀状态。

### 5.3 目录组织规范

#### 优点

- 目录里已经出现清晰的辅助分层：`dto`、`mapping`、`gateway`。
- 没有把所有辅助逻辑都继续塞进 service 文件。
- `packages/types` 和 `packages/utils` 的存在，说明仓库已经开始区分“共享类型层”和“共享工具层”。
- `payment` 域已经完成 H5 / Webhook / Tenant 入口拆分。
- `tenant` 域已经形成 `os-*` 与 `tenant-*` 两条侧边界主线，目录组织比初稿时清晰很多。

#### 不足

- 领域目录仍以“模块名”划分为主，`tenant` 目录内部虽然边界已拆开，但 OS 侧、租户侧、共享 access/swagger/helper 仍共处一层。
- `import` 域仍然承担预检、模板、runner、worker 等多类职责，目录层面的终局拆分尚未完成。

#### 判断

目录规范属于**明显改善、但未彻底收口**的状态，后续仍应继续朝“角色边界 + 用例边界”演进。

### 5.4 业务拆解规范

#### 优点

- `payment` 域的拆解在当前仓库里是最好的，已经出现 `query`、`operation`、`webhook`、`ledger` 这类用例级分离。
- `payment.controller.ts` 已拆分为 H5 / Webhook / Tenant 三类入口，入口角色边界已清楚。
- `import` 域也开始走向可维护结构，已有 `runner`、`template`、`normalizer`、`mapping`、`worker helpers` 等拆分。
- `tenant` 域已经完成一轮比较扎实的边界治理：`TenantService`、`OsTenantQueryService`、`OsTenantLifecycleService`、`OsTenantCertificationService`、`TenantCertificationService` 的职责已经拉开。
- `order-print` 已拆成查询与写入两块，`order-print.service.ts` 的历史超标问题已经解除。
- `controller` 整体上没有失控成“胖控制器”，业务语义大体仍在 service 中收口。

#### 不足

- `import` 仍是当前最明显的重模块，`import.service.ts` 与 `import-job-runner.service.ts` 仍接近上限。
- `payment-query.service.ts` 仍然偏重，后续如果继续叠加查询场景，仍需要继续拆分。
- `tenant-admin-user.service.ts` 虽未超标，但职责仍偏宽，后续也值得继续按用例拆小。

#### 判断

业务拆解已经从“方向正确”进入“阶段性落地”阶段，但重模块清债仍未完成。

### 5.5 NestJS 框架使用规范

#### 优点

- `main.ts` 中的全局 `ValidationPipe`、`ResponseInterceptor`、异常过滤器装配比较成熟。
- 对 Webhook raw body 验签、导入预检大 body、打印配置中 body 做了分路由 body parser 控制，这一点明显优于很多普通项目。
- `AppModule` 保持了较清晰的装配职责，没有把业务细节散到应用入口。
- `PrismaService`、`RedisService` 这类基础设施服务已经形成统一接入点。

#### 不足

- 仍有少量控制器聚合同一侧下的多个用例，例如 `tenant-admin.controller.ts` 目前同时承接 OS 侧租户列表、生命周期写操作和成员查询。
- 代码已经具备较强的 Nest 使用能力，但距离“入口层完全按侧边界 + 用例边界铺开”的终局还有一点距离。

#### 判断

NestJS 使用方式整体是**成熟的、工程化的**，而且入口层边界较初稿时已有明显改善，这一项仍是本仓库的优势项之一。

### 5.6 Swagger 健康度

#### 优点

- Swagger 覆盖度较高，面向联调足够实用。
- `@ApiOperation`、`@ApiOkResponse`、`@ApiExtraModels` 等装饰器使用较完整。
- 很多接口说明已经不只是“字段是什么”，而是补充了业务语义与前端认知约束。

#### 风险

- Swagger 当前更像“展示层文档”，而不是唯一契约源。
- 当前项目同时存在：
  - `docs/api`
  - `packages/types/contracts`
  - DTO
  - Swagger classes
- 这 4 套东西并行维护，虽然治理顺序明确，但长期成本较高，且容易局部漂移。

#### 判断

Swagger 达到了“联调可用、比大多数项目更认真”的水平，但尚未达到“优秀的单源契约系统”。

### 5.7 Skills 成熟度

#### 优点

- 当前 Skills 数量克制，仅保留 6 个高价值、项目贴合度高的主题。
- 每个 Skill 都围绕仓库事实源顺序、边界约束、质量标准设计，不是泛泛而谈的工作流口号。
- `api-contract-governance`、`tenant-boundary-and-rbac`、`payment-and-ledger-safety` 这类 Skill 说明仓库已形成“高风险链路显式治理”的意识。
- Skills 与 `README.md`、`AGENTS.md` 的事实源顺序一致，没有互相打架。
- `AGENTS.md` 现已补充章节式改造协作约定，说明仓库对“AI 如何分步改造、何时验证、何时统一 lint/format”也形成了稳定偏好。

#### 不足

- 当前仍没有一份专门针对“测试与验证收口”的独立 Skill；不过这类规则已经先沉淀进 `AGENTS.md`，紧迫性较初稿时降低。

#### 判断

Skills 体系是当前仓库的特色优势，已经达到**健康且接近优秀**的水平。

### 5.8 Test 测试体系

#### 现状

当前测试体系主要由两类脚本组成：

- `test:smoke`
- `test:backend-regression`

同时仓库已有统一收口命令：

- `pnpm check:backend`

这说明仓库并非完全没有测试意识，而是选择了“构建产物校验 + 本地回归脚本”的路线。

#### 真实问题

- 报告初稿阶段的 `smoke` 漂移问题已经修复，`pnpm check:backend` 当前可通过。
- 但当前测试仍主要依赖脚本式验证，尚未形成 `jest` / `vitest` / `@nestjs/testing` / `*.spec.ts` 这类可组合、可局部运行的结构化测试体系。
- 因此，测试已经从“失效”回到“可用”，但还没有进入“稳定而细粒度”的优秀状态。

#### 结构性问题

- 当前未发现 `jest` / `vitest` / `@nestjs/testing` / `*.spec.ts` 这类结构化测试体系。
- 当前测试更多是“脚本式验证”，而不是“可组合、可局部运行、可针对 service 和 domain 做精细验证”的分层测试体系。
- 因此，测试在当前仓库里已经是“可用质量闸门”，但还不能算“稳定且高覆盖的质量闸门”。

#### 判断

Test 仍是当前仓库最弱的维度之一，但其问题已经从“失效”切换为“深度不足”。

## 6. 哪些方面已经达到业界较健康水平

以下方面已经达到业界比较健康，甚至高于一般中小团队后端仓库的水平：

- 事实源顺序明确，不让 Swagger 反向定义业务语义
- 仓库级规则沉淀到 `README.md`、`AGENTS.md`、Skills
- 高风险链路具备显式治理意识，而不是散落在代码中靠记忆维护
- `main.ts` 的启动装配比较成熟
- 核心模块开始按用例拆 service，而不是继续堆单一“大服务”

## 7. 距离优秀仓库还差什么

若以“优秀的长期维护型业务后端仓库”为目标，当前还差以下三项关键能力：

### 7.1 保持当前绿色测试链路，并补结构化测试

这是当前最现实、最有收益的质量项。

现在的问题已经不是“能不能跑通”，而是“能不能更细粒度地保护后续重构”。

### 7.2 把剩余重模块继续切小

优先对象：

- `import.service.ts`
- `import-job-runner.service.ts`
- `payment-query.service.ts`
- `tenant-admin-user.service.ts`

目标不是机械拆文件，而是让“角色入口”和“用例职责”继续收口到更稳定的边界上。

### 7.3 降低并行契约维护成本

当前 `docs/api + contracts + DTO + Swagger` 的治理顺序是合理的，但维护成本偏高。

后续应考虑逐步把 Swagger 更明确地定位为“展示层产物”，避免它继续承担太多独立语义表达职责。

## 8. 优先级建议

### P0

- 保持 `pnpm check:backend` 持续绿色，避免 smoke / regression 再次漂移

### P1

- 继续拆分 `import` 域的控制器与 service 边界
- 收缩 `payment-query.service.ts`、`import.service.ts`、`import-job-runner.service.ts`
- 继续梳理 `tenant-admin-user.service.ts` 与剩余 `os-*` / `tenant-*` 命名尾差

### P2

- 统一一批边界命名顺序
- 评估 `packages/utils` 与 `apps/api/src/common` 的复用策略，减少共享层“挂名存在、实际不用”的情况
- 评估是否需要为测试与验证流程补一份专门的 Skill；当前也可继续沿用 `AGENTS.md` 中的章节式收尾规则

## 9. 最终结论

这个仓库已经不是“随便堆代码”的阶段了，而且相较报告初稿时，结构边界已经完成了一轮实质性收敛。

它的治理意识、事实源体系、AI 协作约束、风险链路拆解意识，都明显高于常见业务型 NestJS 仓库平均线。

但它还不是“优秀仓库”，主要原因不是文档不够，也不是规则不够，而是：

- 测试闸门虽已回绿，但深度仍然不足
- 历史模块边界尚未彻底清债，重心已从 `tenant` / `payment.controller` / `order-print` 转向 `import` 与剩余重 service
- 多套契约层并行维护的长期成本仍偏高

因此，本仓库当前最适合的定位是：

**一套治理意识很强、边界清债已进入落地期、正在从“可维护”向“优秀”逼近的中期架构仓库。**

## 10. 本次实际验证结果

本次评审实际执行并确认：

- `pnpm build`：通过
- `pnpm lint`：通过
- `pnpm format:check`：通过
- `pnpm check:backend`：通过

补充说明：

- 报告初稿阶段曾出现 `smoke` 脚本引用漂移，导致 `pnpm check:backend` 失败。
- 该问题当前已修复，不应再视作现状结论。
