---
name: api-contract-governance
description: 统一维护本仓库的 API 语义文档、闭集枚举、Swagger 结构与共享 contracts。新增或调整接口、字段、状态机、闭集枚举、共享请求响应结构时使用；尤其适用于修改 `docs/api`、`packages/types/src/enums`、`packages/types/src/contracts`、Swagger / DTO 的场景。
---

# API 契约治理

按职责分层维护接口契约体系。

## 适用场景

- 新增或调整接口、字段、状态机、闭集枚举。
- 修改 `docs/api`、`packages/types/src/enums`、`packages/types/src/contracts`、Swagger / DTO。

## 全局规则入口

全局事实源职责、变更类型与文档同步规则以 [AGENTS.md](../../../AGENTS.md) 为准，本 skill 只补充 API 契约治理的专项执行要求。

## 专项补充

- Tenant 端以 `docs/api/tenant-api-doc.md` 作为总览、接口索引与冲突裁决入口；同目录领域文档可在总览授权的业务域内维护接口与领域语义，跨域边界、全局状态口径和冲突裁决以总览为准。
- 若 Swagger 与共享 `contracts` 存在稳定对应关系，优先通过 `implements` 等方式在编译期收紧字段漂移。
- `docs/api` 应聚焦业务语义、状态流转和流程调度，不应长期维护与 Swagger 完全重复的机械结构镜像；Tenant 领域文档可在各自范围内承接语义，但不得绕过总览改动跨域边界或全局状态口径。
- `docs/api` 必须极度精简，只作为 Swagger 与共享 `contracts` 的补充，不能反客为主。接口小节默认只保留标题、Method + Path，以及 0 到 3 条 Swagger / contracts 难以表达的业务说明。
- `docs/api` 不维护权限码、鉴权标记、请求类型、响应类型、Content-Type、分页结构、字段清单、错误码清单、示例、`nullable`、DTO / contract 名称等机械契约内容；这些内容以 Swagger / DTO / contracts 为准。
- 若某接口没有额外业务语义、状态流转、边界或冲突裁决，`docs/api` 中只列接口入口即可，不为了完整性补写说明。
- 业务规则必须回答具体裁决问题，例如状态是否命中、动作是否允许、旧口径是否废弃、字段由谁生成、跨端谁负责确认；避免“业务定位”“稳定能力入口”“功能介绍”这类泛说明。

## 必做顺序

1. 先确认变更属于哪个业务域，以及本次是改语义、改枚举、改结构还是影响持久化。
2. 按 AGENTS 的对应路径维护 `docs/api`、`enums`、Swagger / DTO、`contracts` 与必要的 `schema.prisma`。
3. 完成后复查 API 文档是否只承载业务语义，传输结构是否由 Swagger / DTO 与 `contracts` 表达。

## 硬约束

- 不得从 `contracts`、代码或 Swagger 反向定义 `docs/api/tenant-api-doc.md`；Tenant 领域文档的跨域冲突也不得反向覆盖总览边界。
- 不得把 Swagger / OpenAPI 当成业务语义裁决层。
- 新接口、新状态、新业务字段或影响前端理解的字段语义必须先在 `docs/api` 落业务名和语义边界；纯结构投影、`nullable`、示例和分页包装由 Swagger / DTO 与 `contracts` 承接。
- 涉及 API 文档或 `contracts` 更新的需求，必须先为前后端并行开发提供稳定事实源，明确 API、共享类型、枚举和数据库目标模型；实现完成后再复审修正细节。
- 文档正文必须可独立阅读，不能只写“见某个类型名”。
- `contracts` 不得发明文档未确认的字段、状态或流程，且不得依赖 `generated/*` 或其他仅供内部生成链使用的中间态文件。
- 不要把 `docs/api` 写成第二份 Swagger，也不能让 API 文档承担 `contracts` 的结构投影功能；纯结构参数表、响应字段表与分页包装镜像应逐步收回到 Swagger / DTO / contracts 层。
- 不得在 `docs/api` 的接口小节中保留“权限”“是否鉴权”“契约类型”“请求：X；响应：Y”“响应：文件流”等 Swagger / contracts 已能表达的条目。
- 不得为了让 API 文档看起来完整而复制接口清单以外的机械契约；API 文档宁可短，也不能覆盖 Swagger / contracts 的职责。
- 禁止重建 `packages/types/src/types`。

## 完成标准

- `docs/api` 可直接供前端理解业务语义、状态流转、字段含义与边界；请求/响应结构、分页包装、`nullable` 与示例以 Swagger / `contracts` 为准。
- Swagger / OpenAPI 与 `contracts` 能表达同一份传输结构。
- 公开 `contracts` 仍保持平铺、可复制，不暴露内部生成链细节。
