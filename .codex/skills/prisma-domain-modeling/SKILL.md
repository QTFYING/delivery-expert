---
name: prisma-domain-modeling
description: 统一维护本项目的 Prisma 领域建模。新增或调整 `apps/api/prisma/schema.prisma`、唯一键、组合索引、多租户字段、金额字段、黑盒 JSON 配置字段时使用；尤其适用于把 `docs/prisma/data-model-reference.md` 同步成可执行 schema。
---

# Prisma 领域建模

先判断是否真的需要动库，再做建模。

## 适用场景

- 新增或调整 `apps/api/prisma/schema.prisma`。
- 修改唯一键、组合索引、多租户字段、金额字段、黑盒 JSON 配置字段。

## 必做顺序

1. 先判断这次变更是否真的需要持久化层改动。
2. 需要动库时，先读 `docs/prisma/data-model-reference.md` 与对应 `docs/api/*.md`。
3. 设计字段、关系、唯一键、索引、租户边界与软删除策略。
4. 同步 `schema.prisma`，并校验命名与 `contracts`、`enums` 一致。
5. 影响建模参考时，同步 `docs/prisma/data-model-reference.md`。

## 硬约束

- 纯文档改名或纯读模型投影变化，先不要改库。
- 多租户业务表优先显式带 `tenantId`。
- 对外标识、幂等键、映射关系要有物理唯一约束。
- 金额字段统一使用 `Decimal`。
- 黑盒配置统一用 `Json`，并在文档中声明服务端不解析内部结构。
- 动态扩展字段优先 `Json`，不要无节制扩列。
- 若状态闭集已在 `enums` 定义，schema 中的枚举或字符串字段语义必须保持一致。
- 不沿用文档已废弃的旧字段名做“兼容”。
- 不在 schema 中保留无文档归属的历史字段。
- 不让 `docs/archived/logic_diagram.md` 里的旧模型覆盖当前建模。

## 完成标准

- schema 字段名与 API 文档一致。
- 主键、唯一键、索引能支撑主要查询、幂等与租户隔离需求。
- 建模参考与可执行 schema 不冲突。
