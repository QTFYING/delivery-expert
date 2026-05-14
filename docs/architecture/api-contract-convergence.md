# API 契约分层标准

> 文档定位：长期架构标准
> 生效边界：解释仓库内各契约层的职责分工与维护方式
> 注意：根据仓库约定，`docs/architecture/` 属于背景参考，不是业务事实源

## 1. 目的

本标准用于约束仓库内 API 契约体系的分层边界，目标只有两个：

1. 让每一层只负责一类真相。
2. 降低多层并行维护时的漂移风险。

本标准不替代 `docs/api`、`packages/types/src/enums`、`packages/types/src/contracts`、Swagger / DTO 或 `docs/prisma/data-model-reference.md` 的具体内容，只定义它们之间的职责关系。

## 2. 分层职责

### 2.1 `docs/api`：业务语义层

`docs/api` 负责定义业务语义，包括：

1. 接口用途
2. 字段业务含义
3. 状态机与流转规则
4. 权限边界与调用侧
5. 错误语义与协作约束

`docs/api` 不负责完整镜像 DTO、分页包装或嵌套响应结构，也不维护第二份 Swagger 式字段表。

### 2.2 `packages/types/src/enums`：闭集值层

`packages/types/src/enums` 是稳定闭集值的唯一事实源，负责：

1. 枚举英文值
2. 枚举类型
3. 中文注释

所有状态值、操作值、固定分类值，都应先在这里定义，再同步到其他层。

### 2.3 Swagger / OpenAPI 与 DTO：传输结构层

Swagger / OpenAPI 与 DTO 负责定义 HTTP 传输结构，包括：

1. 请求字段
2. 响应字段
3. 必填与可选
4. `nullable`
5. `example`
6. 分页或列表包装结构

结构是否存在、字段是否可空、请求响应如何展开，以这一层为准；字段的业务含义仍以 `docs/api` 为准。

### 2.4 `packages/types/src/contracts`：共享消费层

`packages/types/src/contracts` 负责对外共享的 TypeScript 结构投影，服务前端或其他调用方消费。

该层必须满足以下约束：

1. 只投影已确认的业务语义与传输结构。
2. 不独立发明字段、状态或流程。
3. 公开结构默认保持平铺、可读、可直接复制给前端。
4. 不依赖 `generated/*`、`openapi.ts` 或其他内部中间态文件。

### 2.5 `docs/prisma/data-model-reference.md`：建模说明层

`docs/prisma/data-model-reference.md` 只负责数据模型与持久化说明，不反向裁决接口语义、响应结构或枚举定义。

## 3. 冲突裁决原则

出现契约冲突时，按冲突类型裁决：

1. 业务语义冲突，看 `docs/api`。
2. 闭集值冲突，看 `packages/types/src/enums`。
3. 请求响应结构、可选项、`nullable`、示例冲突，看 Swagger / DTO。
4. 建模字段、索引、唯一约束冲突，看 `schema.prisma` 与 `docs/prisma/data-model-reference.md`。
5. `contracts` 与上游不一致时，`contracts` 必须回对齐，不能反向改义。

## 4. 维护顺序

不存在“所有变更都必须走同一条链路”的规则，必须先判断本次是在改语义、改结构、改枚举还是改建模。

### 4.1 改语义

适用于新增接口、调整字段含义、调整状态机、调整权限边界。

维护顺序：

1. 先改 `docs/api`
2. 若涉及闭集值，再改 `packages/types/src/enums`
3. 再改 DTO / Swagger
4. 最后同步 `packages/types/src/contracts`
5. 若涉及持久化含义，再同步 `docs/prisma/data-model-reference.md`

### 4.2 改结构

适用于新增展示字段、调整请求响应包装、补 `nullable`、补 `example`、补分页结构。

维护顺序：

1. 先确认 `docs/api` 语义不变
2. 直接改 DTO / Swagger
3. 再同步 `packages/types/src/contracts`

### 4.3 改枚举

适用于新增状态值、调整固定分类值、补齐稳定闭集定义。

维护顺序：

1. 先改 `packages/types/src/enums`
2. 若业务含义有变化，再补 `docs/api`
3. 再同步 DTO / Swagger
4. 最后同步 `packages/types/src/contracts`

### 4.4 改建模

适用于新增表字段、索引、唯一键、持久化约束或数据形态。

维护顺序：

1. 先确认是否影响 `docs/api` 语义
2. 再同步 `schema.prisma`
3. 同步 `docs/prisma/data-model-reference.md`
4. 若传输结构受影响，再补 DTO / Swagger 与 `contracts`

## 5. 长期约束

以下规则长期成立：

1. 不从 `contracts`、代码实现或 Swagger 反向定义 `docs/api`。
2. 不把 Swagger / OpenAPI 当成业务语义裁决层。
3. 不把 `docs/api` 维护成第二份 Swagger 式参数表或响应结构表。
4. 不把公开 `contracts` 自动生成作为默认目标。
5. 不让公开 `contracts` 依赖内部生成产物。
6. 不为减少手写类型而牺牲前端直接复制 `packages/types` 的消费方式。

## 6. 推荐实践

### 6.1 共享结构优先显式收紧

当 Swagger 结构与共享 `contracts` 存在稳定一一对应关系时，优先通过 `implements`、共享基类或显式映射关系在编译期收紧漂移，而不是完全依赖人工记忆同步。

### 6.2 公共包装结构统一复用

分页、列表、通用响应包装等稳定结构，应优先抽成公共 DTO、公共 Swagger 辅助层或共享 contract，避免每个业务域各写一份。

### 6.3 高风险写链路保持审慎

导入、支付、回调、账务流水、复杂状态推进等高风险写链路，可以复用公共结构，但不以“消灭所有手写契约”为目标。该类链路优先保证语义清晰、状态机自洽和人工可审查性。

## 7. 仓库一致性要求

以下文档与配置应长期保持同一套口径：

1. `README.md`
2. `AGENTS.md`
3. `.codex/skills/api-contract-governance/SKILL.md`
4. `docs/api/*.md`
5. `docs/prisma/data-model-reference.md`

如果这些文件之间出现职责冲突，应回到本标准重新校正，而不是继续叠加新的例外说明。
