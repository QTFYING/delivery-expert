# Tenant 商户 SaaS 端 — API 总览与接口索引

> 本文档为 Tenant（商户端）API 的总览、接口索引与全局业务口径
> 生成日期：2026-04-07

---

## 一、总则

> [!NOTE]
> **全局规范指引**
> 关于统一下发的 `code/data/message` 响应体包装、分页参数的请求与返回体指引、全局 `Http Status` 错误码机制以及环境拦截要求，请直接翻阅架构总览 **[api-architecture-overview.md]** 的第二章。
> 本档负责描述 Tenant 端全局业务语义、角色边界、状态口径、跨端协作和接口入口；枚举值以 `packages/types/src/enums` 为准，请求/响应结构、分页包装、`nullable` 与示例以 Swagger 与共享 `contracts` 为准。
> Tenant 端按订单、导入、流水、设置四个核心功能组织领域文档；领域文档在各自范围内承接业务语义，跨领域冲突时以本总览的全局边界为准。
> 本档不再维护与 Swagger 完全同构的机械字段定义、参数表或分页包装镜像。

### 1.1 文档分工

| 文档                                             | 职责                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| [tenant-api-doc.md](./tenant-api-doc.md)         | Tenant 端总览、全局约定、跨端关联、轻量入口与四个核心功能索引              |
| [tenant-orders.md](./tenant-orders.md)           | 订单读写、作废、打印回执、打印追溯、催款、账期订单与内部收款               |
| [tenant-import-flow.md](./tenant-import-flow.md) | 默认模板、租户模板、预检、正式导入、导入任务与快照一致性                   |
| [tenant-finance.md](./tenant-finance.md)         | 收款流水、现金核销、收款汇总、财务汇总、对账明细与对账导出                 |
| [tenant-settings.md](./tenant-settings.md)       | 角色、权限、用户、通用设置、主体资料、打印配置、支付渠道配置、操作日志、资质 |

### 1.2 角色与权限

- 租户侧内置角色继续使用 `TenantRole` 表达初始系统角色
- 租户侧功能权限统一使用 `TenantPermissionCode`
- 租户侧权限业务域统一使用 `TenantPermissionDomain`

| 角色              | 中文名 | 说明                               |
| ----------------- | ------ | ---------------------------------- |
| `TENANT_OWNER`    | 管理员 | 全部权限，包含员工配置与财务全览   |
| `TENANT_OPERATOR` | 打单员 | 默认处理订单导入、打印和发货操作   |
| `TENANT_FINANCE`  | 财务   | 负责现金线下核销、对账单审计处理   |
| `TENANT_VIEWER`   | 访客   | 普通只读账号，不默认开放收款或财务数据 |

**Tenant RBAC 语义：**

- `Role` 是租户侧长期业务模型，表示岗位和权限包；用户通过角色获得权限
- `TenantPermissionCode` 是服务端根据已实现业务模块开放的能力闭集，不允许前端或租户自定义
- 角色可以由租户老板自定义，但角色只能组合服务端已定义的 `TenantPermissionCode`
- 映射模板是独立 Tenant 基础配置能力，权限剥离，使用 `templates.read / templates.manage`
- Tenant 用户新契约使用 `roleId / roleCode / roleName` 表达当前角色，不再用旧 `TenantRole` 作为前端角色事实源
- 当前阶段一个 Tenant 用户只能绑定一个角色；不支持多角色和 ABAC 数据范围
- 当前阶段数据范围仍为当前 `tenantId` 下全部可授权数据；本次只解决“能不能使用某个功能”，不解决“只能看哪些数据”
- `/settings/permissions` 返回的是服务端权限能力树，不是前端菜单树、路由树或按钮配置
- 前端菜单、路由、图标和页面标题由前端自行维护，并通过 `TenantPermissionCode` 绑定权限

### 1.3 订单与账期核心口径

- 订单域相关闭集统一使用 `OrderStatus`、`OrderPayType`、`CreditType`、`OrderImportConflictPolicy`、`OrderImportJobStatus`、`CreditOrderStatus`
- `payType` 表示一级结算方式：`cash` 为现款，`credit` 为账期
- 导入预检中的 `payType` 必须由前端显式提交；若源文件未映射或映射值为空，前端应按用户确认的默认选择补入 `cash` 或其他明确结算方式，服务端不自行把空值判定为现款
- `creditType` 表示 `payType=credit` 时的账期子类型：`month` 为月结，`week` 为周结，`period` 为普通账期
- `payType=cash` 时 `creditType / creditDays / dueDate` 均应为 `null`；`payType=credit` 时 `creditType` 原则上必须为 `month | week | period`
- 滚结本期按现款处理：导入识别为 `payType=cash, creditType=null`，不进入账期管理、账期待办和 `payType=credit` 统计
- `creditStatus` 只作为查询时动态计算的展示字段，不落库
- 当前不新增独立账期规则配置，首页账期待办继续由统计聚合能力承载

---

## 二、认证模块 Auth

> 三端（Admin / Tenant / H5）共用同一套 Auth，后端通过 `user.tenantId` 区分身份。

**关键语义：**

- 租户状态为 `active` 时，按现有租户角色正常登录
- 租户状态为 `onboarding` 时，仅 `TENANT_OWNER` 允许登录 Tenant 端，且只用于初始化配置
- Tenant 端新建用户初始密码由服务端统一设置为 `123456`，首次登录要求用户修改密码
- `GET /auth/me` 是 Tenant 端获取当前登录用户角色、权限列表和 `permissionVersion` 的标准入口
- 登录响应可保持轻量，前端登录成功或页面刷新后应调用 `/auth/me` 获取完整权限快照
- 权限变更感知、初始密码和用户管理细节详见 [tenant-settings.md](./tenant-settings.md)
- Tenant 端支持短信验证码登录与短信验证码找回密码，同时开发环境提供调试查码入口为 `GET /auth/sms-codes/debug`
- 短信认证使用用户绑定手机号 `phone` 定位 Tenant 用户，不使用 `account`；有效 Tenant 用户手机号要求全平台租户范围内唯一
- 发送验证码前必须先确认手机号唯一命中有效 Tenant 用户；未命中、重复命中、用户或租户不可用时不真实发送短信，且不向前端暴露手机号是否存在
- 前端接入阿里云验证码 2.0 增强层（可选）；配置完整时发送短信前校验滑块，未开通或配置缺失时跳过滑块校验

---

## 三、Tenant 四个核心功能索引

| 核心功能 | 职责 | 文档落点 |
| -------- | ---- | -------- |
| 订单 | 本租户订单 CRUD、作废、打印回执、打印追溯、催款、账期订单与内部收款 | [tenant-orders.md](./tenant-orders.md) |
| 导入 | 默认模板、租户模板、预检、正式导入、导入任务轮询与快照一致性 | [tenant-import-flow.md](./tenant-import-flow.md) |
| 流水 | 收款流水、现金核销、收款汇总、财务汇总、对账明细与对账导出 | [tenant-finance.md](./tenant-finance.md) |
| 设置 | 单角色 RBAC、用户、通用设置、主体资料、打印配置、支付渠道配置、操作日志与资质提交 | [tenant-settings.md](./tenant-settings.md) |

---

## 四、轻量入口

轻量入口信息量较小，直接保留在本总览中，避免前端为了少量接口反复跳转。请求/响应结构、`nullable` 与示例仍以 Swagger 与共享 `contracts` 为准。

### 4.1 首页和统计

> 全部数据自动按当前租户过滤。

#### 获取日趋势

- **GET** `/analytics/daily-trend`
- **权限**：`analytics.read`

**契约类型：** 响应：`DailyTrendItem[]`

#### 获取月趋势

- **GET** `/analytics/monthly-trend`
- **权限**：`analytics.read`

**契约类型：** 响应：`MonthlyTrendItem[]`

#### 获取实时收款动态

- **GET** `/analytics/payments/live`
- **权限**：`analytics.read`

**契约类型：** 响应：`LiveFeedEntryItem[]`

#### 获取仪表盘聚合数据

- **GET** `/analytics/dashboard`
- **权限**：`analytics.read`

**契约类型：** 响应：`AnalyticsDashboardResponse`

**补充说明：**

- `roleTitle` 由服务端按当前主角色动态生成
- 聚合接口用于首页一次性取数，避免前端拼装多个统计请求
- 首页账期待办继续通过本接口聚合返回，当前不新增独立账期规则或账期待办接口
- `creditDueSoonCount` 只统计 `payType=credit` 且未结清、未作废、到期日在租户 `creditRemindDays` 范围内的订单；滚结和现款订单不参与统计

### 4.2 通知接收

> Admin 是公告发布方，Tenant 是公告接收方。

**契约约定：**

- Tenant 端只接收已面向当前租户可见的公告
- 通知阅读状态是当前用户自己的阅读状态，不代表公告发布状态

#### 获取平台公告列表

- **GET** `/notifications`
- **权限**：`notifications.read`

**契约类型：** 请求：`TenantNotificationListQuery`；响应：`PaginatedResponse<TenantNotificationRecordItem>`

#### 标记公告已读

- **POST** `/notifications/{id}/read-records`
- **权限**：`notifications.manage`

**契约类型：** 响应：`null`

**业务规则：**

- 只能维护当前登录用户自己的阅读记录
- 不改变公告本身的发布、下架或可见范围

---

## 五、跨项目关联

### 与 H5 端的关联

| Tenant 侧资源 | H5 侧边界 |
| ------------- | --------- |
| 订单二维码入口 | H5 通过订单级公开令牌打开付款页，不承载后台登录态 |
| 支付渠道配置 | H5 只消费当前租户生效且可用的线上收款渠道 |
| 线下登记支付 | H5 提交登记，Tenant 财务负责确认核销 |
| 收款流水 | Tenant 可查看 H5 在线支付成功后生成的收款记录 |

### 与 Admin 端的关联

| Tenant 数据 | Admin 端边界 |
| ----------- | ------------ |
| 订单与收款 | Admin 可跨租户审计查看，不承担 Tenant 侧导入、打印、催款或核销动作 |
| 用户与角色 | Admin 可做平台运营视角管理，不替代 Tenant 侧自定义角色授权 |
| 支付渠道配置 | Admin 可做运营兜底，不改变 Tenant 侧配置归属 |
| 公告 | Admin 负责发布，Tenant 只负责接收和维护阅读状态 |
