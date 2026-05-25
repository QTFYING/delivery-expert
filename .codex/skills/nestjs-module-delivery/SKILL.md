---
name: nestjs-module-delivery
description: 按本项目既定契约落地 NestJS 业务模块。新增或重构 `apps/api/src/*` 模块、controller、service、dto、模块依赖关系时使用；尤其适用于把稳定的 API 文档和 contracts 转成可编码的后端模块实现。
---

# NestJS 模块落地

先对齐契约，再落 controller、service 与 Prisma 分层。

## 适用场景

- 新增或重构 `apps/api/src/*` 业务模块。
- 修改 controller、service、dto、模块依赖关系。

## 必做顺序

1. 先读对应 `docs/api/*.md` 和 `packages/types/src/contracts/*`。
2. 定义 controller 端点、入参和出参。
3. 在 service 收口业务编排、事务边界、权限边界、幂等和 domain 规则调用；核心状态裁决优先复用 domain 规则。
4. 将数据查询与持久化收敛到 Prisma 调用层。
5. 补齐守卫、租户作用域、异常映射和必要的文档同步。

## 硬约束

- controller：只处理 HTTP 契约、参数校验、响应组装。
- service：负责业务编排、事务边界、幂等收口、权限边界和 domain 规则调用。
- domain：负责核心状态裁决与纯业务规则，不依赖 `@prisma/client`，不使用 Prisma enum 承载业务状态机判断。
- Prisma 调用：只做数据查询与持久化，不承载复杂业务判断。
- 不允许 controller 直接散落业务判断。
- 不允许 service 继续沿用文档已废弃的旧字段名。
- 需要事务的链路必须显式用 Prisma transaction 包裹。
- 需要幂等的接口只在真正有业务风险的地方实现，不泛滥上锁。
- Tenant 侧默认按 token 中的 `tenantId` 隔离。
- 触及 class 文件时，所有与 `constructor` 同级的方法都必须补中文注释。
- 方法注释在 1 到 2 行时可使用 `//`；超过 2 行时必须改用块注释 `/** ... */`。
- 注释重点写方法职责、边界和语义，不写低信息量逐行翻译；块注释必须符合 JSDoc 规范，每行结尾不能有中英文句号。

## 粒度与拆分

service 的职责只到编排、事务边界、权限边界、幂等收口与 domain 规则调用。下列职责原则上**不属于** service；新增或明显扩展相关职责时，优先独立成文件；如果这次只是在历史超标文件上做局部修补，至少不要继续把新职责塞回同一个 service：

- 第三方网关（拉卡拉、支付宝等）签名、加解密、报文解析 → `<module>/gateway/<vendor>.adapter.ts`
- Prisma 枚举/实体 ↔ 领域类型的双向映射 → `<module>/mapping/<name>.mapper.ts`
- 复杂业务域按用例划分的子 service → 如 `PaymentQueryService`、`PaymentWebhookService`、`PaymentInitiationService`，主 service 只做编排
- 跨 app 纯函数（金额换算、日期处理等）→ `packages/utils`
- API 工程基础设施工具（依赖 Nest、Prisma、Config、HTTP、Exception、Pipe、Filter、Swagger DTO 等）→ `apps/api/src/common`
- 单业务域 helper、校验、mapper、查询条件、网关适配 → 留在对应业务域目录，不提前上提

文件行数上限：单个 `.ts` 默认 ≤ 500 行，`*.service.ts` ≤ 400 行。这是仓库目标态约束。新写文件不得超标；触及已超标文件时，优先拆出本次改动直接涉及的网关适配、映射层或子 service，不要求为无关历史逻辑一次性清债，但不得继续把新职责堆进超标文件。

## 交付检查

- 模块输入输出与 contracts 一致。
- 核心状态裁决优先由 domain 承载，service 只负责事务、幂等、权限和调用编排。
- 管理端跨租户接口不会错误复用租户侧作用域。
- 本次新增 `.ts` 文件均未超过行数上限；如触及已超标文件，已避免继续堆入新职责，并在合理范围内拆出本次直接涉及的网关适配、映射层或子 service。
