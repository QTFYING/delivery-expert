# 仓库治理 P2 收口说明

> 原计划日期：2026-04-26
> 最后对齐：2026-05-08
> 文档状态：已完成，已归档
> 文档定位：仓库级治理尾项的最终状态说明与后续边界约束
> 适用范围：`apps/api`、`packages/utils`、`AGENTS.md`、`.codex/skills/*`
> 关联来源：`review/archived/api-repo-health.md` 的 P2 收尾项

## 1. 文档定位

本文件不再承担施工 backlog 的职责，只保留 P2 主线的最终结论、与 `order` 收尾的衔接结果，以及后续继续做仓库治理时的边界说明。

本文档不是新的事实源。若与 `README.md`、`AGENTS.md`、`docs/api/*.md` 或现有 Skill 冲突，以这些事实源和仓库级约束为准。

## 2. P2 范围

P2 原始治理范围只有 3 项：

1. 边界命名顺序收敛
2. `packages/utils` 与 `apps/api/src/common` 的放置规则
3. 是否需要新增测试与验证流程 Skill

## 3. 最终状态总表

| 主题         | 最终结果                                                                                   | 当前状态 |
| ------------ | ------------------------------------------------------------------------------------------ | -------- |
| 命名治理     | `tenant` 域历史 `tenant-admin-*` 已清理；`payment` / `order` 不再继续做纯 rename           | 已完成   |
| 共享层策略   | `packages/utils`、`apps/api/src/common`、业务域目录三层放置规则已落文，并完成 1 组最小清理 | 已完成   |
| 验证 Skill   | 沿用 `AGENTS.md` + `project-quality-assurance` + `work-handoff`，不新增独立 Skill          | 已完成   |
| P2 衔接章节  | `order` 模块职责拆分、文档对齐与章节验证已收尾                                             | 已完成   |
| 独立后续专项 | `import` 模块改造已完成并独立归档                                                          | 已完成   |

原 `N01~N03`、`U01~U03`、`S01~S03` 当前均已结项。

## 4. 三条主线的最终结论

### 4.1 命名治理

1. `tenant-admin.controller.ts`、`tenant-admin-user.service.ts`、`create-tenant-admin.dto.ts` 已退出当前代码主线，对应收敛到 `os-tenant.controller.ts`、`os-user.service.ts`、`create-os-tenant.dto.ts`。
2. `payment` 域保留 `payment-h5`、`payment-webhook`、`payment-tenant` 等现有命名主线，不再为了统一而继续做纯 rename。
3. `order` 当前剩余问题属于职责边界，而不是命名尾差；后续若继续调整，应进入业务拆分章节处理。
4. `import` 已从原“延后处理”口径中正式拆出，并已按独立计划完成模块改造与章节验证。
5. 后续新增或重命名文件时，继续优先遵守“调用侧 -> 资源 -> 职责后缀”的顺序。

### 4.2 共享层策略

1. `packages/utils` 只承载纯函数、无 Nest 依赖、可跨 app 复用的通用工具。
2. `apps/api/src/common` 只承载依赖 Nest、Prisma、Config、HTTP、Exception、Pipe、Filter 等 API 工程专属基础设施。
3. 明显只服务单个业务域的 helper、校验、映射、查询条件，留在对应业务域目录，不上提为共享。
4. 已完成的最小闭环是把 `packages/utils/src/index.ts` 中内联的 `formatDate` 收到 `packages/utils/src/date.ts`，`index.ts` 只保留统一导出。
5. 当前没有继续扩大迁移的计划；后续只在出现稳定消费方时再评估是否上提。

### 4.3 测试与验证 Skill 决策

1. 当前不新增独立的测试与验证 Skill。
2. 章节式施工与收尾规则继续由 `AGENTS.md` 承担。
3. 最终质量闸门继续使用 `project-quality-assurance`。
4. 跨设备、跨会话接力继续使用 `work-handoff`。
5. 现有三层机制已覆盖施工约束、最终复核和交接收口，不存在足够稳定且明显重复的新职责值得单独模板化。

## 5. 与 P2 衔接章节的实际结果

P2 治理结论已经向下游章节传导完成。上一轮最直接的衔接项是 `order` 模块职责拆分收尾；截至 2026-05-08，该章节已经结束，不再保留本计划内的待办。

已完成的 `order` 收尾结果如下：

1. `order.controller.ts` 已收敛为订单主入口；打印与财务入口分别拆到 `order-print.controller.ts`、`order-finance.controller.ts`。
2. 平台侧与租户侧读模型查询已拆到 `order-os-query.service.ts`、`order-tenant-query.service.ts`。
3. 打印查询条件组装已外提到 `order-print.query.ts`，`order-print-query.service.ts` 只保留查询执行与结果汇总。
4. Prisma enum 与业务 enum 的双向映射已集中到 `mapping/order-enum.mapper.ts`。
5. `mapping/order.mapper.ts` 当前只保留订单读模型、账期项和行项目映射。
6. 相关说明文档已对齐 `order` 入口拆分后的真实结构，不再把 `order.controller.ts` 写成同时承载打印和财务入口。
7. 本章节验证已完成：`pnpm -F api build`、`pnpm -F api test:smoke`、`pnpm lint`、`pnpm format:check`。
8. 当前判断是继续把打印查询再拆成更细粒度 helper 的收益不明显，因此 `order` 在 P2 衔接层面视为已收口。

## 6. 当前待完成清单

当前主线任务无剩余待完成项。

`import` 独立专项也已完成，相关计划文档已转入归档目录。

若后续继续推进仓库治理，应按新的章节目标重新立项，不再沿用本文件中的 `N / U / S`、`order` 或 `import` 待办口径。

## 7. 后续边界

1. 不再为 `payment`、`order` 做新一轮纯命名收敛；只有在职责拆分时才顺带调整命名。
2. 不为“看起来共享”而批量把 `apps/api/src/common` 搬进 `packages/utils`。
3. 不新增独立的测试与验证 Skill。
4. 不继续拆 `order` 打印查询为更细 helper，除非出现明确的复用收益或复杂度收益。
5. `import` 改造已收尾并归档，不再回写成 P2 主线未完成项。
6. 后续新的仓库治理任务，应新建章节目标或新计划文件，不把本文件重新扩回施工日志。

## 8. 后续接手入口

如果后续要继续做新的仓库治理章节，建议按以下顺序进入：

1. 先读 `README.md`。
2. 再读 `AGENTS.md`。
3. 再读 `review/archived/api-repo-health.md`。
4. 最后再读本文件，确认哪些结论已经固定，哪些事项需要单独立项。

补充说明：

1. `notes/handoffs/repo-governance-p2-2026-04-26.md` 已删除，不再维护双份状态口径。
2. 新的交接文档只用于临时接力，不再代替主线计划文档。

## 9. 一句话结论

截至 2026-05-08，仓库治理 P2 的三条主线、与之衔接的 `order` 收尾，以及独立拆出的 `import` 模块改造都已完成并归档。
