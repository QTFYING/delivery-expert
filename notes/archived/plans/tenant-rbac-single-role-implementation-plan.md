# Tenant 单角色 RBAC 落地指南方案书

> 日期：2026-05-26
> 文档状态：已完成，已归档
> 文档定位：非事实源施工方案，正式编码前必须按 `docs/api -> enums -> contracts -> schema/data-model-reference -> implementation` 同步事实源
> 适用范围：Tenant 侧自定义角色、功能权限、用户角色分配、接口授权和权限变更感知
> 当前决策：采用“租户自定义角色 + 单角色功能权限 RBAC”，不做完整 ABAC 数据范围，不支持一个用户多个角色
> 归档说明：Tenant 单角色 RBAC 主线 T04-T09 已完成并通过验证；后续若继续推进，T09 回归与过渡残留收口已完成

## 一、当前结论

本项目当前使用者主要是单一区域代理商，暂不需要跨区域、跨门店、跨部门、跨业务员的数据范围，也不需要一个用户多个角色。

因此，本次不采用完整 RBAC / ABAC，而采用更适合当前阶段的单角色功能权限 RBAC：

```text
用户绑定一个角色
角色作为长期权限包
角色包含一组服务端定义的 permissionCodes
后端接口按 permissionCode 授权
service 继续按 token 中的 tenantId 做租户隔离
```

本方案解决的问题：

- 租户老板可以创建自定义角色
- 租户老板可以给角色勾选功能权限
- 员工可以绑定一个角色
- 前端菜单、按钮和后端接口共用同一套权限编码
- Tenant 侧接口从旧 `@Roles(TENANT_*)` 逐步迁移到 `@Permissions(...)`
- 权限变更后前端无需轮询，通过 `permissionVersion` 感知并刷新 `/auth/me`
- 旧 `users.role` 仅作为数据库迁移与 Admin 内部兼容字段保留，Tenant 新契约不再暴露旧 `role`

本方案不解决的问题：

- 一个用户多个角色
- 资源级 ABAC 条件授权
- 跨区域、跨门店、跨部门、跨业务员的数据范围
- 按客户、线路、仓库、门店做数据隔离
- Admin 平台侧 RBAC
- H5 公开支付页权限改造
- 前端自定义权限点
- 租户自定义菜单结构

## 二、概念边界

### 1. Role 是长期权限包

`Role` 不是临时兼容概念，而是 RBAC 的长期业务模型。

长期正确关系是：

```text
User -> Role -> Permission
```

也就是：

```text
用户绑定角色
角色包含权限
接口校验权限
```

`Role` 的职责：

- 表达岗位、身份和权限包
- 作为老板管理员工的入口
- 承载系统内置角色和租户自定义角色
- 让同类员工复用同一组权限

`Permission` 的职责：

- 表达服务端已实现并开放授权的具体业务能力
- 作为菜单、按钮和接口授权的共同能力开关
- 作为后端 guard 的授权依据

需要逐步弱化的是旧固定枚举字段：

```text
users.role
```

`users.role` 保留为数据库迁移、Admin 平台用户和过渡期内部投影使用，不再作为 Tenant 业务接口授权事实源，也不再作为 Tenant 新契约字段暴露给前端。

### 2. PermissionCode 是服务端闭集能力

`permissionCodes` 必须由服务端定义为闭集，不允许前端或租户老板自定义。

正确边界是：

```text
服务端定义能力
前端展示能力
老板组合能力
后端校验能力
```

租户老板可以自定义：

- 角色名称
- 角色描述
- 角色包含哪些已有 `permissionCodes`
- 哪些员工绑定该角色

租户老板不能自定义：

- 新的 `permissionCode`
- 新的后端业务动作
- 新的接口安全边界

原因：

- 每个 `permissionCode` 都应对应服务端真实接口或业务动作
- 后端接口需要通过 `@Permissions(...)` 识别它
- 前后端菜单、按钮和接口授权需要共用同一套稳定 code
- 权限是安全边界，不能由前端或租户自由发明

### 3. 菜单树只是权限配置 UI，不是权限事实源

当前项目没有 Tenant 菜单结构表，也不需要新增租户菜单表。

角色新增和编辑时，前端不提交完整菜单树，只提交：

```ts
{
  name: string;
  description?: string;
  permissionCodes: TenantPermissionCode[];
}
```

权限树由服务端根据权限定义生成：

```text
GET /settings/permissions
```

前端职责：

- 按服务端返回的权限树展示菜单/功能/按钮勾选 UI
- 处理勾选联动
- 提交选中的 `permissionCodes`
- 根据当前用户 `permissions` 控制菜单和按钮显隐

后端职责：

- 定义合法 `permissionCodes`
- 定义权限能力树分组、业务域和说明文案
- 校验提交的 `permissionCodes` 是否合法
- 保存角色与权限关系
- 在接口层校验权限

结论：

```text
菜单树可以是权限配置的 UI，但不能是权限系统的事实源
```

权限树不是前端菜单树或路由树。服务端返回的 `domain` 表示权限所属业务域，`description` 表示该业务域或权限能力的说明文案，不代表前端菜单名称、路由名称、页面标题或按钮文案。前端菜单、路由、图标和页面布局仍由前端自行维护，并通过 `permissionCode` 绑定到服务端权限能力。

### 4. 权限定义放代码，角色授权存在数据库

采用两层存放：

```text
系统支持哪些 permissionCode -> 代码定义
某个租户角色拥有哪些 permissionCode -> 数据库存储
```

代码中维护：

- `TenantPermissionCodeEnum`
- 权限树定义
- 权限分组、标签和排序
- 内置角色默认权限矩阵
- 权限校验 helper

数据库中维护：

- 租户角色
- 角色拥有的权限 code
- 用户绑定哪个角色

当前阶段不新增 `permissions` 表，也不新增 `menus` 或 `tenant_menus` 表。

## 三、目标架构

### 1. 当前授权方式

当前 Tenant 侧真实授权方式是：

```text
users.role
  -> controller @Roles(...)
  -> service 按 tenantId 做租户隔离
```

现有问题：

- 角色固定，老板不能自定义角色
- `/settings/roles` 和 `/settings/permissions` 更多是展示用途
- 前端展示权限和后端接口授权不是同一事实源
- 新增角色必须改后端 `@Roles`
- 自定义角色无法访问旧 `@Roles(TENANT_*)` 保护的接口

### 2. 目标授权方式

目标 Tenant 侧授权方式：

```text
tenant_roles
  -> tenant_role_permissions
  -> user_role_assignments
  -> PermissionService 生成用户权限快照
  -> PermissionsGuard 校验 PermissionCode
  -> service 继续按 tenantId 做租户隔离
```

Admin 侧仍保留：

```text
@Roles(UserRoleEnum.OS_SUPER_ADMIN)
```

H5 侧仍不进入后台 RBAC：

```text
H5 只通过 qrCodeToken 打开公开支付页
```

## 四、数据模型设计

### 1. `tenant_roles`

用途：承载租户内角色定义。

建议字段：

```text
id                  String UUID primary key
tenantId            String
code                String
name                String
description         String nullable
isSystem            Boolean
isEditable          Boolean
sortOrder           Int
createdBy           String UUID nullable
updatedBy           String UUID nullable
createdAt           DateTime timestamptz
updatedAt           DateTime timestamptz
```

建议约束：

```text
unique(tenantId, code)
unique(tenantId, id)
index(tenantId, deletedAt)
index(tenantId, isSystem, sortOrder)
```

说明：

- `tenantId` 必须显式存在，所有查询和写入都要按租户隔离
- 内置角色 code 使用旧角色值，例如 `TENANT_OWNER`
- 自定义角色 code 使用后端生成值，例如 `custom_<uuid片段>`
- `name` 在同一租户下未删除角色内应唯一
- `name` 在同一租户未删除角色内唯一通过手写 SQL partial expression unique index 收口：`(tenantId, lower(name)) WHERE deletedAt IS NULL`

### 2. `tenant_role_permissions`

用途：承载角色和权限的多对多关系。

建议字段：

```text
roleId              String UUID
permissionCode      String
createdAt           DateTime timestamptz
```

建议约束：

```text
primary key(roleId, permissionCode)
index(permissionCode)
```

说明：

- `permissionCode` 存储为字符串，但业务层必须校验其属于 `TenantPermissionCodeEnum`
- 不建议使用 Prisma enum 存储权限 code，避免每次新增权限都需要数据库 enum 迁移
- 数据库只记录角色选择结果，不承载权限定义事实源

### 3. `user_role_assignments`

用途：承载用户和角色绑定关系。

建议字段：

```text
id                  String UUID primary key
tenantId            String
userId              String UUID
roleId              String UUID
isPrimary           Boolean
createdBy           String UUID nullable
createdAt           DateTime timestamptz
updatedAt           DateTime timestamptz
```

当前阶段建议约束：

```text
unique(tenantId, userId)
index(tenantId, roleId)
```

说明：

- 产品层面当前只允许一个用户一个角色
- `isPrimary` 当前恒为 `true`
- 使用绑定表而不是直接 `users.roleId`，为未来多角色保留结构空间
- 未来如果支持多角色，主要调整 `unique(tenantId, userId)` 和权限聚合规则
- 用户和角色均通过复合外键绑定 `tenantId`，数据库层阻断跨租户绑定

### 4. 暂不新增 Data Scope 模型

本次不新增 `dataScopeType`、`dataScopeConfig` 或独立 data scope 表。

原因：

- 当前业务明确不需要交叉权限
- 当前订单、支付、财务等资源缺少统一归属字段
- 提前设计数据范围容易形成无用字段
- 功能权限 RBAC 已能覆盖当前区域代理商场景

未来如升级完整 RBAC / ABAC，可新增：

```text
tenant_role_data_scopes
```

或扩展：

```text
user_role_assignments.dataScopeType
user_role_assignments.dataScopeConfig
```

## 五、权限编码与内置矩阵

### 1. 权限编码位置

建议新增：

```text
packages/types/src/enums/permission.ts
```

用于导出：

```ts
TenantPermissionCodeEnum;
TenantPermissionCode;
```

后端新增：

```text
apps/api/src/authorization/tenant-permission.definition.ts
```

用于维护：

- 权限树
- 权限标签
- 权限分组
- 内置角色默认权限
- 权限闭集校验辅助逻辑

### 2. 初版权限编码清单

初版权限编码只覆盖当前已落地 Tenant 端能力，不纳入 Admin 远景规划能力。

当前闭集控制在 25 个权限点，按业务能力而非接口动作逐项拆分。

```text
analytics.read

orders.read
orders.manage
orders.void
orders.import.manage
orders.print.manage
orders.reminder.create

credit.read
credit.receipt.create

payments.read
payments.cash_verify.create

finance.read
finance.export

settings.general.manage
settings.users.manage
settings.roles.manage
settings.printing.read
settings.printing.update
settings.audit_logs.read
settings.payment_configs.read
settings.payment_configs.manage

tenant.profile.read
tenant.certification.manage

notifications.read
notifications.manage
```

### 3. 已确认的敏感权限默认口径

| 权限点                            | Owner | Finance | Operator | Viewer | 口径                                                     |
| --------------------------------- | ----- | ------- | -------- | ------ | -------------------------------------------------------- |
| `payments.cash_verify.create`     | 是    | 是      | 否       | 否     | 线下核销影响收款和对账，Owner 默认拥有，Finance 日常使用 |
| `finance.export`                  | 是    | 是      | 否       | 否     | 导出数据只开放给财务岗位，便于导入财务软件               |
| `settings.payment_configs.read`   | 是    | 是      | 否       | 否     | Finance 可只读排障，敏感字段需脱敏                       |
| `settings.payment_configs.manage` | 是    | 否      | 否       | 否     | 保存、停用和切换支付渠道只给 Owner                       |
| `orders.void`                     | 是    | 否      | 默认否   | 否     | 作废订单不可逆，打单员如需使用应通过自定义角色授予       |
| `orders.reminder.create`          | 是    | 是      | 默认否   | 否     | 默认归财务催款，打单员催款由自定义角色单独授予           |
| `settings.printing.read`          | 是    | 否      | 是       | 否     | 打单员可只读打印配置                                     |
| `settings.printing.update`        | 是    | 否      | 否       | 否     | 维护打印配置只给 Owner                                   |

### 4. 内置角色默认权限原则

Owner：

- 拥有全部 Tenant 权限
- 不允许裁剪核心权限
- 始终满足最后可用 Owner 保护

Finance：

- 支付、核销、财务、财务导出、对账、账期、首页、通知
- 支付渠道配置只读
- 不拥有支付渠道管理权限

Operator：

- 订单查看、维护
- 导入管理
- 打印管理
- 打印配置只读
- 默认不拥有订单作废和催款权限

Viewer：

- 普通只读账号，不默认开放收款、账期、财务或配置数据
- 订单只读
- 首页和统计只读
- 通知只读
- 租户资料只读

默认权限矩阵：

| 角色     | 默认权限                                                                                                                                                                                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner    | 全部 Tenant 权限                                                                                                                                                                                                                                                                          |
| Finance  | `analytics.read`、`orders.read`、`orders.reminder.create`、`credit.read`、`credit.receipt.create`、`payments.read`、`payments.cash_verify.create`、`finance.read`、`finance.export`、`settings.payment_configs.read`、`tenant.profile.read`、`notifications.read`、`notifications.manage` |
| Operator | `orders.read`、`orders.manage`、`orders.import.manage`、`orders.print.manage`、`settings.printing.read`、`tenant.profile.read`、`notifications.read`、`notifications.manage`                                                                                                              |
| Viewer   | `analytics.read`、`orders.read`、`tenant.profile.read`、`notifications.read`                                                                                                                                                                                                              |

## 六、接口契约改造

### 1. `/settings/permissions`

职责：返回服务端定义的权限能力树，供前端渲染角色授权页面。

边界：

- 权限能力树由后端统一定义
- 前端不能提交完整权限树
- 前端只能提交从权限树中勾选出来的 `permissionCodes`
- 当前不新增菜单结构表
- 返回结构不承载前端路由、菜单、图标或页面标题
- `domain` 表示权限所属业务域，也是业务域节点的唯一标识
- `description` 表示服务端对业务域或权限能力的说明文案，不是前端菜单文案
- `code` 表示可授权的权限项，也是权限项唯一标识
- 角色创建和更新只提交 `permissionCodes`，不提交业务域或树节点结构

建议响应结构：

```ts
interface TenantPermissionTreeResponse {
  version: string;
  domains: TenantPermissionDomainNode[];
}
```

建议业务域结构：

```ts
interface TenantPermissionDomainNode {
  domain: TenantPermissionDomain;
  description: string;
  permissions: TenantPermissionItem[];
}
```

建议权限项结构：

```ts
interface TenantPermissionItem {
  code: TenantPermissionCode;
  description: string;
}
```

结构规则：

- `domains[].domain` 是业务域标识，例如 `orders`、`finance`
- `domains[].permissions[].code` 是真实授权值
- 前端角色勾选时只能保存 `permissions[].code`
- 当前不做二级分组
- 当前不做多语言契约

示例：

```json
{
  "version": "tenant-rbac-2026-05-26",
  "domains": [
    {
      "domain": "orders",
      "description": "订单域",
      "permissions": [
        {
          "description": "查看订单",
          "code": "orders.read"
        },
        {
          "description": "作废订单",
          "code": "orders.void"
        }
      ]
    }
  ]
}
```

### 2. `/settings/roles`

职责：返回当前租户角色列表，包括内置角色和自定义角色。

建议响应字段：

```ts
interface TenantRoleAccount {
  id: string;
  code: string;
  name: string;
  description?: string;
  permissions: TenantPermissionCode[];
  isSystem: boolean;
  isEditable: boolean;
  userCount: number;
  createdAt?: string;
  updatedAt?: string;
}
```

本次不兼容旧前端，`permissions` 的元素类型直接收敛为 `TenantPermissionCode[]`。前端展示角色时使用 `id / code / name`，不要再依赖旧 `TenantRole` 枚举字段表达角色。

### 3. 角色管理接口

新增：

```text
POST   /settings/roles
PUT    /settings/roles/{id}
DELETE /settings/roles/{id}
```

创建角色请求：

```ts
interface CreateTenantRoleRequest {
  name: string;
  description?: string;
  permissionCodes: TenantPermissionCode[];
}
```

更新角色请求：

```ts
interface UpdateTenantRoleRequest {
  name?: string;
  description?: string;
  permissionCodes?: TenantPermissionCode[];
}
```

业务规则：

- 创建和更新时只接收 `permissionCodes`，不接收菜单树
- `permissionCodes` 必须属于服务端闭集
- 自定义角色至少包含一个权限
- 自定义角色名称同租户未删除角色内唯一
- 内置角色第一版不可编辑权限
- 内置角色不可删除
- 自定义角色有用户绑定时不可删除
- 删除采用软删除

### 4. `/settings/users`

创建和更新用户时使用 `roleId` 作为角色绑定主字段。

本次不兼容旧前端，因此 Tenant 用户接口不再接收旧 `role`，也不再返回旧 `role` 或 `legacyRole`。

创建用户请求：

```ts
interface CreateTenantUserRequest {
  name: string;
  phone: string;
  account?: string;
  roleId: string;
}
```

更新用户请求：

```ts
interface UpdateTenantUserRequest {
  name?: string;
  phone?: string;
  account?: string;
  roleId?: string;
  status?: UserSimpleStatus;
}
```

建议响应结构：

```ts
interface TenantSettingsUser {
  id: string;
  name: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  phone: string;
  status: UserSimpleStatus;
  lastLogin: string;
}
```

所有 `roleId` 入参都必须校验属于当前登录用户的 `tenantId`，禁止通过其他租户角色 ID 越权绑定。

### 5. `/auth/me`

`/auth/me` 需要改造为当前登录用户权限快照入口。

建议 Tenant 用户返回：

```ts
interface AuthMeResponse {
  id: string;
  account: string;
  realName: string;
  tenantId: string | null;
  requiresPasswordReset: boolean;
  roleId: string | null;
  roleCode: string | null;
  roleName: string | null;
  permissions: TenantPermissionCode[];
  permissionVersion: number;
}
```

建议口径：

- `POST /auth/login` 可以继续返回基础用户信息和 token
- 前端登录成功后调用 `/auth/me` 获取完整权限快照
- 页面刷新时也调用 `/auth/me` 恢复权限状态
- Tenant 前端不再依赖旧 `role` 字段
- Admin 平台侧是否继续返回旧 `role` 由 Admin 契约单独决定，不反向影响 Tenant RBAC 新契约
- Admin 用户可返回 `roleId = null`、`roleCode = OS_SUPER_ADMIN`、`permissions = []`、`permissionVersion = 0`

## 七、权限变更感知

### 1. 不采用前端轮询

权限变更是低频事件，不建议前端轮询，也暂不引入 WebSocket 或 SSE。

采用：

```text
权限变更 -> bump permissionVersion + 清理权限缓存
用户下次请求 -> 服务端返回权限变更业务码
前端收到业务码 -> 重新调用 /auth/me
```

### 2. `permissionVersion`

建议为每个 Tenant 用户维护 `permissionVersion`。

存储可选：

- Redis 中维护用户权限版本
- 数据库用户权限状态表维护版本
- 初版可结合现有 Redis session 能力实现

JWT payload 建议新增：

```text
pver: permissionVersion
```

当老板修改角色权限或用户角色绑定时：

- 清理受影响用户权限快照缓存
- bump 受影响用户 `permissionVersion`
- 不默认踢下线

### 3. 权限变更业务码

建议新增业务码：

```text
4006 权限已变更，请刷新当前用户信息
```

前端处理：

```text
收到 4006
  -> 调用 /auth/me
  -> 更新 permissions 和 permissionVersion
  -> 重建菜单、路由和按钮
  -> 如果当前页面已无权限，跳转到无权限页或首页
```

### 4. 权限快照缓存

建议缓存 key：

```text
tenant-permissions:{tenantId}:{userId}
```

快照结构：

```ts
interface TenantPermissionSnapshot {
  tenantId: string;
  userId: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  permissions: TenantPermissionCode[];
  permissionVersion: number;
  updatedAt: string;
}
```

## 八、后端模块落地

建议新增目录：

```text
apps/api/src/authorization
```

建议文件：

```text
authorization.module.ts
permissions.decorator.ts
permissions.guard.ts
permission.service.ts
permission-cache.service.ts
tenant-permission.definition.ts
mapping/permission.mapper.ts
```

职责划分：

- `permissions.decorator.ts`：定义 `@Permissions`
- `permissions.guard.ts`：读取装饰器元数据并校验当前用户权限
- `permission.service.ts`：聚合用户角色和权限，生成权限快照
- `permission-cache.service.ts`：读写 Redis 权限快照和版本
- `tenant-permission.definition.ts`：维护权限能力树、数字节点 ID、业务域、说明文案和内置角色权限矩阵
- `mapping/permission.mapper.ts`：处理 Prisma 结构与 contract 投影

Guard 边界：

- 不负责数据范围
- 不拼 Prisma 查询条件
- 不替代 service 的业务状态校验
- Owner 内置角色默认拥有全部 Tenant 权限
- Tenant 用户必须有 `tenantId`
- Admin 和 H5 不走 Tenant 权限判断

## 九、正式迁移策略

### 1. 不依赖 seed

项目已进入稳定迭代周期，正式环境迁移不依赖 `db:seed`。

`seed` 只用于本地空库初始化。

### 2. 结构迁移与数据迁移分离

结构迁移：

```text
apps/api/prisma/migrations/<timestamp>_add_tenant_rbac/migration.sql
```

职责：

- 新增 `tenant_roles`
- 新增 `tenant_role_permissions`
- 新增 `user_role_assignments`
- 新增索引、唯一约束和外键

数据迁移：

```text
apps/api/prisma/data-migrations/migrate-tenant-rbac.js
```

职责：

- 为所有未删除租户创建四个内置角色
- 为内置角色写入默认权限
- 按现有 `users.role` 绑定用户到对应内置角色
- 跳过平台用户
- 输出迁移报告
- 默认 dry-run / preflight，显式 `--apply` 才写库
- 支持重复执行
- 遇到异常不猜测修复

不建议把复杂数据迁移写入纯 SQL，原因：

- dry-run 不友好
- 异常报告不友好
- 难复用权限闭集定义
- 难处理冲突和人工确认

### 3. 迁移规则

现有用户迁移：

```text
users.role = TENANT_OWNER    -> 绑定租户内 TENANT_OWNER 角色
users.role = TENANT_OPERATOR -> 绑定租户内 TENANT_OPERATOR 角色
users.role = TENANT_FINANCE  -> 绑定租户内 TENANT_FINANCE 角色
users.role = TENANT_VIEWER   -> 绑定租户内 TENANT_VIEWER 角色
```

平台用户：

```text
tenantId = null
role = OS_SUPER_ADMIN
```

不创建 Tenant 角色绑定。

异常场景：

- 租户没有任何 Owner：输出异常，人工处理
- Tenant 角色用户 `tenantId = null`：输出异常，跳过
- 有 `tenantId` 的用户角色为 `OS_SUPER_ADMIN`：输出异常，跳过
- 已存在用户角色绑定且和 `users.role` 不一致：输出冲突，不覆盖
- 找不到对应内置角色：终止该租户迁移

迁移报告至少包含：

- 处理租户数
- 创建角色数
- 更新角色数
- 创建权限绑定数
- 创建用户角色绑定数
- 跳过用户数
- 异常用户数
- 冲突记录

## 十、兼容策略

### 1. 前端契约不做旧字段兼容

本次按新 Tenant 前端契约改造，不兼容旧前端角色字段。

Tenant 新契约统一使用：

- `roleId`
- `roleCode`
- `roleName`
- `permissions`
- `permissionVersion`

Tenant 新契约不再暴露：

- `TenantSettingsUser.role`
- `legacyRole`

`AuthMeResponse.role` 是否继续存在只服务 Admin 或全局历史认证契约，不作为 Tenant RBAC 新契约字段使用。

### 2. 授权代码兼容

过渡期允许：

```text
@Roles 和 @Permissions 并存
```

但新增 Tenant 接口禁止只写 `@Roles(TENANT_*)`。

最终目标：

```text
Tenant 业务接口全部使用 @Permissions
Admin 接口继续使用 @Roles(OS_SUPER_ADMIN)
H5 接口不进入后台权限系统
```

### 3. 数据兼容

`users.role` 在数据库层暂时保留，但不作为 Tenant 授权事实源，也不作为 Tenant 新接口字段。

更新用户角色时同步维护：

- `user_role_assignments`
- 必要时更新 `users.role` 的内部 legacy 投影，仅用于迁移、Owner 保护过渡和 Admin 侧历史逻辑

自定义角色无法准确投影到旧 `TenantRole`，因此不得把旧 `role` 继续暴露为前端可判断角色字段。

## 十一、章节式施工清单

后续真正编码时必须按仓库章节式改造约定执行。每个小项开工前，应先向用户说明本步改什么、不改什么、影响哪些文件，并得到确认后再动手。

### T01 权限语义与事实源

目标：固化 RBAC 业务语义、权限闭集、内置角色默认矩阵和 `/auth/me` 权限快照语义。

涉及文件：

- `docs/api/tenant-api-doc.md`
- `docs/api/api-architecture-overview.md`
- `packages/types/src/enums`
- `packages/types/src/contracts/auth.ts`
- `packages/types/src/contracts/settings.ts`

不做：

- 不改 Prisma schema
- 不改 controller 授权

验证：

- `pnpm -F @shou/types build`

### T02 Prisma 结构迁移

目标：新增 RBAC 三张表、复合租户外键和必要索引约束，并将本次上线前确认的数据库索引/唯一键治理并入同一批结构迁移。

涉及文件：

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/<timestamp>_add_tenant_rbac/migration.sql`
- `docs/prisma/data-model-reference.md`
- `apps/api/src/import/import-job-order.persistence.ts`

本次一并收口的数据库索引治理：

- 删除 `user_role_assignments` 单角色模型下冗余的 `(tenantId, userId, roleId)` 唯一键
- 为 `tenant_roles` 和 `import_templates` 使用手写 SQL partial expression unique index 约束未删除记录名称唯一
- 将 `orders.sourceOrderNo` 从全量唯一调整为未删除订单唯一，正式导入查重改为 `tenantId + sourceOrderNo + deletedAt:null`
- 为 `printer_templates` 改用 `(tenantId, importTemplateId)` 复合外键绑定导入模板，避免跨租户配置
- 为 `orders` 改用 `(tenantId, mappingTemplateId)` 复合外键绑定导入模板，避免订单跨租户挂载导入模板
- 补齐平台侧 `tenants`、`payments`、`orders`、`payment_orders`、`payment_webhook_events` 等高频查询索引

迁移执行前应做只读预检：未删除导入模板同租户同名重复、未删除订单同租户同 `sourceOrderNo` 重复、打印配置与导入模板 `tenantId` 不一致、订单与导入模板 `tenantId` 不一致。当前开发库预检结果均为 0 条；开发库尚无 `tenant_roles` / `user_role_assignments` 表。

不做：

- 不做业务接口替换
- 不做权限 guard

验证：

- `pnpm -F api prisma:generate`
- `pnpm -F api build` 当前可作为已知失败项记录；失败原因来自 T01 后续 service / Swagger / DTO 尚未同步，不作为 T02 schema 验证阻断

### T03 数据迁移工具

目标：提供正式环境可 dry-run、幂等、可审计的 RBAC 数据迁移脚本。

涉及文件：

- `apps/api/prisma/data-migrations/migrate-tenant-rbac.js`

执行方式：

- 一次性脚本，直接使用 `node apps/api/prisma/data-migrations/migrate-tenant-rbac.js`
- 默认只执行 dry-run / preflight
- 只有显式传入 `--apply` 才允许写库
- `--dry-run` 与 `--apply` 不能同时使用

不做：

- 不依赖 seed
- 不在启动时自动执行
- 不新增 package 脚本入口

验证：

- `node --check apps/api/prisma/data-migrations/migrate-tenant-rbac.js`
- 本地 dry-run / preflight 输出报告
- `pnpm -F api build` 当前仍受 T01 后续 DTO / Swagger / mapper 未同步影响，不作为 T03 脚本验证阻断

### T04 Authorization 模块（已完成）

目标：新增 `@Permissions`、`PermissionsGuard`、权限快照、权限缓存和 `permissionVersion` 基础能力。

涉及文件：

- `apps/api/src/authorization/*`
- `apps/api/src/auth/jwt.strategy.ts`
- `apps/api/src/auth/decorators/current-user.decorator.ts`
- Redis 权限缓存相关代码

不做：

- 不批量替换业务 controller

验证：

- `pnpm -F api build`

### T05 Auth 权限快照（已完成）

目标：改造 `/auth/me` 返回当前用户角色绑定、权限列表和 `permissionVersion`。

涉及文件：

- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/auth/auth.swagger.ts`
- `packages/types/src/contracts/auth.ts`

不做：

- 登录响应是否返回完整权限由前端联调决定，默认只要求 `/auth/me` 返回

验证：

- `pnpm -F api build`
- `pnpm -F api test:smoke`

### T06 Settings 角色管理（已完成）

目标：将 `/settings/roles`、`/settings/permissions` 和 `/settings/users` 接入真实 RBAC 数据。

涉及文件：

- `apps/api/src/settings/*`
- `apps/api/src/settings/dto/*`
- `apps/api/src/settings/settings.swagger.ts`
- `packages/types/src/contracts/settings.ts`

不做：

- 不替换订单、支付、财务等业务 controller

验证：

- `pnpm -F api build`
- 权限角色管理最小回归

### T07 Tenant 业务接口权限替换（已完成）

目标：按模块把 Tenant 侧 `@Roles(TENANT_*)` 替换为 `@Permissions(...)`。

建议顺序：

1. `report`、`notification`、`tenant profile` 等低风险只读接口
2. `import`、`order print`、`order read/write`
3. `finance`、`payment`、`cash verification` 等高风险接口
4. `settings payment configs`、`settings printing` 等配置接口

不做：

- Admin `OS_SUPER_ADMIN` 接口不纳入本次替换
- H5 接口不纳入本次替换

验证：

- 每个模块替换后执行 `pnpm -F api build`
- 涉及支付、核销、财务时加跑 `pnpm -F api test:smoke`

### T08 权限变更一致性（已完成）

目标：完成角色权限变更、用户角色变更后的缓存清理和 `permissionVersion` bump。

涉及范围：

- 角色创建、更新、删除
- 用户创建、更新角色、禁用、删除
- 权限快照缓存
- 前端业务码 `4006`

验证：

- 角色权限减少后，受影响用户下次请求触发权限变更感知
- `/auth/me` 能返回最新权限
- `pnpm -F api build`

### T09 回归与收口（已完成）

目标：补齐权限相关回归，并清理过渡期残留。

完成状态：已完成，已补跨租户 `roleId` 绑定拒绝回归，并通过章节总检查。

检查项：

- Tenant 侧是否仍存在只靠 `@Roles(TENANT_*)` 的业务接口
- `/settings/roles` 是否仍返回硬编码旧定义
- `/settings/permissions` 是否来自统一权限定义
- `permissionCodes` 是否全部闭集校验
- 角色、权限、用户绑定是否全部按 `tenantId` 隔离

验证：

- `pnpm -F @shou/types build`
- `pnpm -F api build`
- `pnpm -F api test:smoke`
- `pnpm check:backend`

## 十二、关键风险与控制

### 1. 新旧授权并存导致漂移

风险：

- 前端认为有权限，后端旧 `@Roles` 拒绝
- 后端旧 `@Roles` 放行，但新角色并未勾选权限

控制：

- 按模块列出仍使用 `@Roles(TENANT_*)` 的接口
- 每替换一个模块补最小 403 回归
- 新增 Tenant 接口必须使用 `@Permissions`

### 2. 旧 `TenantRole` 无法表达自定义角色

风险：

- 自定义角色不属于旧闭集
- 如果 Tenant 新契约继续暴露旧 `role`，前端会误把旧枚举当成真实角色事实源

控制：

- Tenant 新契约不再返回 `role` 或 `legacyRole`
- 用户、角色和 `/auth/me` 统一使用 `roleId / roleCode / roleName`
- 数据库 `users.role` 仅作为内部过渡字段保留

### 3. 权限编码设计过粗或过细

风险：

- 过粗导致角色无法满足真实分工
- 过细导致老板配置困难，前端状态复杂

控制：

- 初版只覆盖已落地接口
- 按页面和业务动作分组展示
- 不把远景规划 Admin 能力纳入本次权限树

### 4. 权限变更不实时生效

风险：

- 员工被移除权限后，旧会话仍可访问

控制：

- 使用 `permissionVersion`
- 权限变更清缓存并 bump 版本
- 前端收到 `4006` 后刷新 `/auth/me`

### 5. Owner 保护被新模型绕过

风险：

- 删除角色或改绑定时绕过最后 Owner 保护

控制：

- Owner 保护逻辑迁移到 role assignment 层
- 所有用户角色变更统一走 Settings role/user service
- 禁止在多个 service 中散落角色绑定写入

### 6. 租户边界遗漏

风险：

- 通过 `roleId` 绑定其他租户角色
- 查询其他租户角色或权限

控制：

- 所有 role 查询和写入都带 `tenantId`
- `roleId` 入参必须校验属于当前 `tenantId`
- 用户角色绑定唯一约束包含 `tenantId`

## 十三、验收标准

功能验收：

- 每个租户默认拥有四个内置角色
- 老板可以创建自定义角色
- 老板可以编辑自定义角色权限
- 老板可以删除未绑定用户的自定义角色
- 老板不能删除内置角色
- 老板不能删除有用户绑定的角色
- 创建用户可选择角色
- 更新用户可切换角色
- 自定义角色用户能按勾选权限访问接口
- 未勾选权限的接口返回 `403`
- Owner 始终拥有全部 Tenant 权限
- `/settings/permissions` 返回带 `version` 的权限能力树
- 权限能力树按 `domains[].permissions[]` 组织
- 业务域用 `domain` 标识，权限项用 `code` 标识
- 角色创建和更新只提交 `permissionCodes`，不提交菜单树

迁移验收：

- 老用户迁移后可正常登录
- 原四类角色用户权限与改造前业务语义基本一致
- Tenant 用户接口不再依赖旧 `role`
- Tenant 用户接口统一返回 `roleId / roleCode / roleName`
- 数据库 `users.role` 仅作为内部过渡字段保留

权限变更验收：

- 修改角色权限后，受影响用户 `permissionVersion` 变化
- 修改用户角色后，目标用户 `permissionVersion` 变化
- 受影响用户下次请求能感知权限变更
- 前端可通过 `/auth/me` 获取最新权限

安全验收：

- Tenant 用户不能访问其他租户角色
- Tenant 用户不能绑定其他租户角色
- Tenant 用户不能通过 roleId 越权到其他租户
- 平台用户不进入 Tenant 角色绑定
- H5 接口不受后台 RBAC 影响
- 权限变更后缓存失效可验证

工程验收：

- `pnpm -F @shou/types build` 通过
- `pnpm -F api prisma:generate` 通过
- `pnpm -F api build` 通过
- `pnpm -F api test:smoke` 通过
- 权限相关最小回归覆盖角色创建、角色更新、用户绑定、接口 403

## 十四、当前最终口径

本方案是当前阶段推荐落地口径：

```text
Role 是长期权限包
PermissionCode 是服务端闭集能力
权限能力树不是前端菜单树
角色接口只提交 permissionCodes
权限定义和权限树在代码中维护
权限树按 domain 分组，权限项以 code 作为授权事实源
角色、角色权限、用户角色绑定存在数据库
正式迁移不依赖 seed
/auth/me 返回权限快照和 permissionVersion
Tenant 新契约使用 roleId / roleCode / roleName，不再暴露旧 role
前端不轮询权限变化
Tenant 接口最终使用 @Permissions 授权
```

如果未来升级完整 RBAC / ABAC，本方案可复用：

- 角色表
- 角色权限表
- 用户角色绑定表
- 权限闭集
- 权限树
- `@Permissions`
- `PermissionsGuard`
- 权限快照
- `permissionVersion`
- Settings 角色管理接口

未来新增的主要是：

- 数据范围模型
- ScopeService
- 业务资源归属字段
- 查询条件注入
- 多角色聚合规则

因此，本方案不会把未来锁死在单角色 RBAC 上，同时避免当前阶段为暂不需要的 ABAC 数据范围付出过高改造成本。
