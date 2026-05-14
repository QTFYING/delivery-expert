---
name: api-contract-governance
description: 统一维护本仓库的 API 语义文档、闭集枚举、Swagger 结构与共享 contracts。新增或调整接口、字段、状态机、闭集枚举、共享请求响应结构时使用；尤其适用于修改 `docs/api`、`packages/types/src/enums`、`packages/types/src/contracts`、Swagger / DTO、`docs/prisma/data-model-reference.md` 的场景。
---

# API 契约治理

按职责分层维护接口契约体系。

## 适用场景

- 新增或调整接口、字段、状态机、闭集枚举。
- 修改 `docs/api`、`packages/types/src/enums`、`packages/types/src/contracts`、Swagger / DTO、`docs/prisma/data-model-reference.md`。

## 层级职责

1. `docs/api` 定义业务语义、状态流转与字段含义。
2. `packages/types/src/enums` 定义稳定闭集值。
3. Swagger / OpenAPI 定义传输结构、可选项、`nullable` 与示例。
4. `packages/types/src/contracts` 只做共享消费层结构投影，不独立发明语义；公开 contract 默认保持平铺、可读、可直接复制给前端。

说明：

- 不存在对所有变更都通用的一条固定维护顺序，必须先判断本次是在改语义、改枚举还是改结构。
- 若 Swagger 与共享 `contracts` 存在稳定一一对应关系，优先通过 `implements` 等方式在编译期收紧字段漂移。
- `docs/api` 应逐步回收到业务语义层，不长期维护与 Swagger 完全重复的机械结构镜像。

## 必做顺序

1. 先确认变更属于哪个业务域，以及本次是改语义、改枚举还是改结构。
2. 改语义时：先改 `docs/api`，把字段、状态和值的业务含义写清楚。
3. 涉及闭集值时：再改 `packages/types/src/enums`，收口稳定英文值。
4. 涉及传输结构时：再改 DTO / Swagger，把请求、响应、可选项与示例同步。
5. 最后再改 `packages/types/src/contracts`，只做共享消费层结构投影。
6. 影响建模时，再同步 `docs/prisma/data-model-reference.md`。

## 常用路径

1. 改语义：`docs/api -> enums -> Swagger/DTO -> contracts -> data-model-reference`
2. 改结构：先确认 `docs/api` 语义不变，再改 `Swagger/DTO -> contracts`
3. 改枚举：`packages/types/src/enums -> docs/api -> Swagger/DTO -> contracts`

## 硬约束

- 不得从 `contracts`、代码或 Swagger 反向定义 `docs/api`。
- 不得把 Swagger / OpenAPI 当成业务语义裁决层。
- 新字段、新状态、新接口必须先在 `docs/api` 落名。
- 文档正文必须可独立阅读，不能只写“见某个类型名”。
- 枚举值必须使用稳定英文值。
- `contracts` 不得发明文档未确认的字段、状态或流程。
- 公开 `contracts` 不得依赖 `generated/*` 或其他仅供内部生成链使用的中间态文件。
- 不要把 `docs/api` 写成第二份 Swagger；纯结构参数表、响应字段表、分页包装镜像应逐步收回到 Swagger / DTO 层。
- 禁止重建 `packages/types/src/types`。

## 完成标准

- `docs/api` 可直接供前端联调。
- 枚举只在 `packages/types/src/enums` 定义一次。
- Swagger / OpenAPI 与 `contracts` 能表达同一份传输结构。
- 公开 `contracts` 仍保持平铺、可复制，不暴露内部生成链细节。
- `contracts`、枚举、建模参考与 API 文档同名同义。
