# Tenant 商户 SaaS 端 — API 总览与接口索引

> 本文档为 Tenant（商户端）API 的总览与接口索引

---

## 一、总则

> [!NOTE]
> **全局规范指引**
> 请求/响应结构、分页、`nullable` 与示例以 Swagger 与共享 `contracts` 为准。
> 本档只保留 Tenant 端入口索引和少量跨模块口径。

### 1.1 文档分工

| 文档                                             | 职责                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| [tenant-api-doc.md](./tenant-api-doc.md)         | Tenant 端总览、少量跨模块口径、轻量入口与四个核心功能索引                    |
| [tenant-orders.md](./tenant-orders.md)           | 订单读写、作废、打印回执、打印追溯、催款、账期订单与内部收款                 |
| [tenant-import-flow.md](./tenant-import-flow.md) | 默认模板、租户模板、预检、正式导入、导入任务与快照一致性                     |
| [tenant-finance.md](./tenant-finance.md)         | 收款流水、线下登记确认、收款汇总、财务汇总、对账明细与对账导出               |
| [tenant-settings.md](./tenant-settings.md)       | 角色、权限、用户、通用设置、主体资料、打印配置、支付渠道配置、操作日志、资质 |

### 1.2 角色与权限

- `Role` 是租户侧长期业务模型，表示岗位和权限包；用户通过角色获得权限
- `TenantPermissionCode` 是服务端根据已实现业务模块开放的能力闭集，不允许前端或租户自定义
- 角色可以由租户老板自定义，但角色只能组合服务端已定义的 `TenantPermissionCode`
- 当前阶段一个 Tenant 用户只能绑定一个角色；不支持多角色和 ABAC 数据范围
- `/settings/permissions` 返回的是服务端权限能力树，不是前端菜单树、路由树或按钮配置

### 1.3 订单与账期核心口径

- 导入预检中的 `payType` 必须由前端显式提交；若源文件未映射或映射值为空，前端应按用户确认的默认选择补入 `cash` 或其他明确结算方式，服务端不自行把空值判定为现款
- 滚结本期按现款处理：导入识别为 `payType=cash, creditType=null`，不进入账期管理、账期待办和 `payType=credit` 统计
- `creditStatus` 只作为查询时动态计算的展示字段，不作为订单固定字段
- `OrderStatus.credit` 已废弃；账期只由 `payType=credit` 表达
- `OrderStatus.voided` 表示已作废，不与 `expired` 混用；本期不开放作废状态搜索
- 本期订单搜索只开放 `status=pending / paid / expired`，其中 `expired` 按现款支付有效期或账期到期日动态判断；`partial / voided` 不作为搜索条件
- 当前不新增独立账期规则配置，首页账期待办继续由统计聚合能力承载

---

## 二、认证模块 Auth

> 三端（Admin / Tenant / H5）共用同一套 Auth，后端通过 `user.tenantId` 区分身份。

**关键语义：**

- 租户状态为 `active` 时，按现有租户角色正常登录
- 租户状态为 `onboarding` 时，仅 `TENANT_OWNER` 允许登录 Tenant 端，且只用于初始化配置
- Tenant 端新建用户初始密码由服务端统一设置为 `123456`，首次登录要求用户修改密码
- `GET /auth/me` 是 Tenant 端获取当前登录用户角色、权限列表和 `permissionVersion` 的标准入口
- `PATCH /auth/me` 当前仅支持消费 `user_avatar` 上传结果更新或清空当前用户头像
- Tenant 端支持短信验证码登录与短信验证码找回密码，同时开发环境提供调试查码入口为 `GET /auth/sms-codes/debug`
- 短信认证使用用户绑定手机号 `phone` 定位 Tenant 用户，不使用 `account`；有效 Tenant 用户手机号要求全平台租户范围内唯一
- 发送验证码前必须先确认手机号唯一命中有效 Tenant 用户；未命中、重复命中、用户或租户不可用时不真实发送短信，且不向前端暴露手机号是否存在

---

## 三、Tenant 四个核心功能索引

| 核心功能 | 职责                                                                              | 文档落点                                         |
| -------- | --------------------------------------------------------------------------------- | ------------------------------------------------ |
| 订单     | 本租户订单 CRUD、作废、打印回执、打印追溯、催款、账期订单与内部收款               | [tenant-orders.md](./tenant-orders.md)           |
| 导入     | 默认模板、租户模板、预检、正式导入、导入任务轮询与快照一致性                      | [tenant-import-flow.md](./tenant-import-flow.md) |
| 流水     | 收款流水、线下登记确认、收款汇总、财务汇总、对账明细与对账导出                    | [tenant-finance.md](./tenant-finance.md)         |
| 设置     | 单角色 RBAC、用户、通用设置、主体资料、打印配置、支付渠道配置、操作日志与资质提交 | [tenant-settings.md](./tenant-settings.md)       |

---

## 四、轻量入口

轻量入口信息量较小，直接保留在本总览中，避免前端为了少量接口反复跳转。

### 4.1 首页和统计

> 全部数据自动按当前租户过滤。

#### 获取日趋势

- **GET** `/analytics/daily-trend`

#### 获取月趋势

- **GET** `/analytics/monthly-trend`

#### 获取实时收款动态

- **GET** `/analytics/payments/live`

#### 获取仪表盘聚合数据

- **GET** `/analytics/dashboard`

**补充说明：**

- 聚合接口用于首页一次性取数，避免前端拼装多个统计请求
- 首页账期待办继续通过本接口聚合返回，当前不新增独立账期规则或账期待办接口
- `creditDueSoonCount` 只统计 `payType=credit` 且未结清、未作废、到期日在租户 `creditRemindDays` 范围内的订单；滚结和现款订单不参与统计

### 4.2 通知接收

> Admin 是公告发布方，Tenant 是公告接收方。

#### 获取平台公告列表

- **GET** `/notifications`

#### 标记公告已读

- **POST** `/notifications/{id}/read-records`

**业务规则：**

- 只能维护当前登录用户自己的阅读记录
- 不改变公告本身的发布、下架或可见范围
