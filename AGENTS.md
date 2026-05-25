# AGENTS.md

本文件定义本仓库对智能编码代理的默认约束。

## 1. 语言

- 与用户沟通默认使用中文。
- 新增或重写的说明性文档默认使用中文。
- 英文仅用于代码、接口路径、枚举值、库名和命令。

## 2. 全局约束入口

以下内容对项目持续生效：

1. `README.md`
2. `AGENTS.md`
3. `.codex/skills/*`
4. `docs/api/*.md`

## 3. 事实源顺序

涉及接口、字段、枚举、状态机、数据模型时，按以下顺序判断：

1. `docs/api/*.md`
2. `packages/types/src/enums`
3. `packages/types/src/contracts`
4. `docs/prisma/data-model-reference.md`
5. `apps/api` 实现代码
6. Swagger / OpenAPI

补充：

- `docs/api` 定义业务语义、状态流转与字段含义
- `enums` 定义枚举值
- `contracts` 只做共享结构投影与消费，不独立发明语义
- 公开 `contracts` 默认保持平铺、可读、可直接复制给前端，不依赖 `generated/*` 或其他内部中间态
- `data-model-reference` 只做建模同步
- Swagger / OpenAPI 只做传输结构与联调展示，不得反向推动接口改义
- 若 Swagger 与共享 `contracts` 存在稳定一一对应关系，优先通过 `implements` 等方式在编译期收紧字段漂移
- `docs/api` 应逐步回收到业务语义层，不长期维护与 Swagger 完全重复的机械参数表、响应字段表与分页包装镜像
- 上述顺序用于回溯业务语义争议，不等于所有变更都按同一固定链路修改
- 改语义：`docs/api -> enums -> Swagger/DTO -> contracts -> data-model-reference`
- 改结构：先确认 `docs/api` 语义不变，再改 `Swagger/DTO -> contracts`
- 改枚举：`packages/types/src/enums -> docs/api -> Swagger/DTO -> contracts`

## 4. 非事实源

`docs/architecture/`、`docs/deployment/`、`notes/`、`review/`、`docs/archived/` 只作背景参考，不作为编码或设计事实源。

## 5. 编码边界

- 不恢复已废弃的 `/print/jobs` 语义。
- 不让旧字段重新进入主链路，例如 `erpOrderNo`、`customFields`、旧 `payStatus` 主流程。`templateId` 仅保留在当前文档已定义的导入/映射链路，不得回流成旧订单主链路语义。
- 打印配置只存黑盒 JSON，不在服务端解析模板内部结构。
- 多租户隔离、支付金额正确性、状态机一致性高于“先把功能写出来”。
- 单个 `.ts` 文件默认不超过 500 行，`*.service.ts` 不超过 400 行。这是仓库目标态约束，不代表当前所有历史文件都已达成。新写文件不得超标；触及已超标文件时，优先拆出本次修改直接涉及的第三方网关适配层、Prisma ↔ 领域类型映射层或按用例划分的子 service，不要求为无关历史逻辑一次性清债，但不得继续把新职责堆进超标文件。

## 6. 默认分层

- controller 只处理 HTTP 契约、参数校验、鉴权接入和响应组装。
- service 负责业务编排、事务边界、幂等收口和 domain 规则调用；核心状态裁决优先复用 domain 规则。
- Prisma 查询与写入只承载持久化，不散落核心业务判断。
- `domain` 层不得依赖 `@prisma/client`，不得使用 Prisma 生成枚举承载业务状态机判断；领域函数应接收业务枚举、领域快照或 `packages/types` 中的共享语义类型。
- `mapper` 层负责 Prisma 持久化结构与领域/契约结构互转，Prisma enum 与业务 enum 的双向映射应集中在 mapper 中维护，并优先使用闭集映射表让新增枚举触发编译期缺口。
- 在尚未单独封装 repository 的模块中，service 可以在 Prisma 查询条件、事务 client 类型、create/update 持久化数据中使用 Prisma 类型；但把数据传入 domain 前必须先经 mapper 转成领域快照，domain 返回的状态迁移结果写库前也必须经 mapper 转回 Prisma data。
- service 不应把 Prisma enum 当作业务语义直接推进状态机。若只是构造 `where`、`select`、`orderBy` 或写入持久化字段，可以使用 Prisma enum；若是在判断“是否允许支付、核销、入账、作废、阻塞业务动作”，应优先调用 domain 规则或使用 mapper 转换后的业务枚举。
- `packages/utils` 只放纯函数、无 Nest 依赖、可跨 app 复用的通用工具；`apps/api/src/common` 只放 API 工程专属基础设施工具，如依赖 Nest、Prisma、Config、HTTP、Exception、Pipe、Filter 的辅助代码。
- 明显只服务单个业务域的 helper、校验、映射、查询条件，不要提前抽到共享层，留在对应业务域目录。

## 7. 文档同步

- 改接口语义或状态机：检查 `docs/api`、`enums`、`contracts`、Swagger。
- 改结构字段或响应包装：先确认 `docs/api` 语义不变，再检查 `contracts`、Swagger。
- 改共享读模型且 Swagger 与 `contracts` 可稳定对齐时，优先显式增加编译期约束，不只靠人工同步记忆。
- 改枚举：检查 `packages/types/src/enums`、`docs/api`、`contracts`。
- 改数据模型：检查 `docs/prisma/data-model-reference.md` 与 `schema.prisma`。
- 改仓库级规则：检查 `README.md`、`AGENTS.md` 与相关 `.codex/skills/*`。

## 8. 默认动作

1. 先读 `README.md` 与 `AGENTS.md`。
2. 再读对应业务域的 `docs/api/*.md`。
3. 必要时继续看 `enums`、`contracts`、`data-model-reference`。
4. 最后再看当前实现代码。

## 9. 工作流约定

### 9.1 通用规则

- 用户明确要求始终高于默认工作流；用户要求“直接做”“不要计划”“不要测试”“不要并行”时，优先服从用户要求。
- 不为工作流而工作流。单文件低风险修补、纯文案同步、注释或轻微命名调整，可直接执行，不强制先写长计划。
- 下列任务默认先给出简短实施计划，再动手：支付、账务、导入、多租户、权限、Prisma 建模、跨模块重构、涉及 `docs/api` / `contracts` / `schema.prisma` 同步的改动、或单次改动明显跨多个业务域。
- 遇到 Bug、回归、偶发错误、原因不明的问题，先收集现象、复现路径和相关代码证据，再判断根因；禁止跳过证据链直接猜测式修复。
- 大范围修改前，先说明本次变更会触及的模块、事实源和验证方式；避免先改实现、后补文档、最后才发现语义冲突。
- 能验证时，完成前必须运行与结论直接相关的验证命令；不能运行时，必须明确说明未执行的验证项、当前停留状态和剩余风险。
- 对高风险链路，优先保证“状态机自洽、金额正确、多租户隔离、接口语义一致”，再考虑实现速度；不要把“代码已改完”当成“任务已完成”。

### 9.2 章节式改造协作约定

- 适用于导入改造、模块拆分、跨文件重构、技术债治理等“可拆成多个小步骤”的章节型任务。
- 先定章节目标，再拆成 `T01`、`T02`、`T03` 这类小项；每个小项都应尽量做到改动面小、目标单一、可独立审查、可独立回退。
- 每个小项开工前，先向用户说明本步改什么、不改什么、预计影响哪些文件；得到确认后再动手。如果用户在开工前追加限制、命名要求或边界要求，先吸收进本步再执行。
- 实施时只做当前小项，不顺手扩散到无关模块；不要把多个边界不相干的改动揉成一个提交。
- 单个小项完成后，先跑与本步直接相关的最小验证：
  - 结构、注入、装配调整优先跑 `pnpm -F api build`
  - 涉及运行链路、模块协作、边界拆分时，再加跑 `pnpm -F api test:smoke`
- `pnpm lint`、`pnpm format:check` 默认放到一个章节全部完成后统一执行，不要求每个 `T0X` 小步都重复运行；如有必要，再在章节收尾时执行 `pnpm check:backend`。
- 触及 class 文件时，所有与 `constructor` 同级的方法都要补中文注释：
  - 1 到 2 行说明可使用 `//`
  - 超过 2 行说明必须使用 `/** ... */`
  - 注释重点写方法职责、边界和语义，不写低信息量逐行翻译，且符合JSDoc规范，每行结尾不能有"。"或者"."等中英文句号
- 纯 `lint` / `format` 收尾批次、纯机械格式修正批次，可不因本次改动额外补业务注释。
- 默认在一个章节全部完成、验证通过、用户审查确认后再统一提交；如果用户明确要求，也可以按单个 `T0X` 小项提前提交。
- 需要跨设备、跨会话或切换到其他 AI 接力时，优先使用 `work-handoff` Skill，把当前状态写入 `notes/handoffs/*.md`，并显式区分已完成项、未完成项、核心关注点和验证状态。
