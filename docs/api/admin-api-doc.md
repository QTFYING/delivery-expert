# Admin 平台运营后台

> 本文档只补充 Admin 侧无法从 Swagger 与共享 `contracts` 直接推导的运营边界
> 请求/响应结构、分页、`nullable` 与示例以 Swagger 和共享 `contracts` 为准

## 一、通用边界

Admin 用户 `tenantId = null`，可以跨租户查看和管理平台运营数据。

Admin 可查看跨租户订单与收款数据，但不承担 Tenant 侧订单导入、打印、催款、线下确认等动作。

## 二、认证 Auth

> 与 Tenant 端共用同一套 Auth。平台用户通过 `tenantId = null` 区分。

### 2.1 登录

- **POST** `/auth/login`

### 2.2 刷新令牌

- **POST** `/auth/refresh`

### 2.3 退出登录

- **POST** `/auth/logout`

### 2.4 获取当前用户信息

- **GET** `/auth/me`

### 2.5 更新当前用户资料

- **PATCH** `/auth/me`

## 三、控制台与仪表盘

### 3.1 获取控制台上下文

- **GET** `/platform/console`

### 3.2 获取平台核心指标

- **GET** `/platform/metrics`

### 3.3 获取平台待办事项

- **GET** `/platform/todos`

### 3.4 获取租户健康度

- **GET** `/platform/tenant-health`

### 3.5 获取登录风险事件

- **GET** `/platform/risk-events`

### 3.6 获取平台数据总览

- **GET** `/platform/overview`

## 四、租户中心

### 4.1 获取租户列表

- **GET** `/tenants`

**补充说明：**

- 老板账号摘要来自当前首个 `TENANT_OWNER` 用户；该摘要不作为租户主体资料存储

### 4.2 创建租户

- **POST** `/tenants`

**业务规则：**

- 创建租户时同步创建首个 `TENANT_OWNER` 账号
- 租户初始状态为 `onboarding`
- 首个老板账号可登录 Tenant 端完成初始化配置，但这不等于租户已正式开通线上收款

### 4.3 编辑租户主体资料

- **PUT** `/tenants/{id}`

### 4.4 局部编辑租户主体资料

- **PATCH** `/tenants/{id}`

**业务规则：**

- 租户主体资料编辑不承载冻结、解冻、支付渠道切换或老板账号资料变更

### 4.5 创建租户审核决议

- **POST** `/tenants/{id}/audit-decisions`

**业务规则：**

- `approve` 时状态流转为 `active`
- `reject` 时状态保持 `onboarding`，并记录驳回原因

### 4.6 创建租户批量审核批次

- **POST** `/tenants/audit-batches`

### 4.7 创建租户续费记录

- **POST** `/tenants/{id}/renewals`

**业务规则：**

- 续费以新的服务到期日期为准，不再接收续费天数

### 4.8 冻结租户

- **POST** `/tenants/{id}/freeze`

### 4.9 解冻租户

- **POST** `/tenants/{id}/unfreeze`

**业务规则：**

- 冻结和解冻是明确动作接口，不占用租户主体资料更新语义

### 4.10 创建租户批量状态变更批次

- **POST** `/tenants/status-change-batches`

### 4.11 获取组织架构成员列表

- **GET** `/tenants/members`

### 4.12 获取资质审核队列

- **GET** `/tenants/certifications`

### 4.13 创建资质审核决议

- **POST** `/tenants/certifications/{id}/review-decisions`

**状态流转规则：**

- `pending_initial_review + approve` 进入初审后下一阶段
- `pending_secondary_review + approve` 进入确认阶段
- `pending_confirmation + approve` 进入 `approved`
- 任一待处理状态被驳回后进入 `rejected`

### 4.14 获取租户支付渠道配置列表

- **GET** `/tenants/payment-configs`

### 4.15 获取单租户单渠道配置详情

- **GET** `/tenants/{id}/payment-configs/{channel}`

### 4.16 强制停用单租户单渠道配置

- **POST** `/tenants/{id}/payment-configs/{channel}/disable`

### 4.17 切换单租户当前生效支付渠道

- **POST** `/tenants/{id}/payment-configs/{channel}/activate`

**业务规则：**

- Admin 对租户支付配置的操作是运营兜底，不替代 Tenant 侧的渠道配置归属
- 当前仅已接入且可用的线上收款渠道允许激活

## 五、用户管理

### 5.1 获取用户列表

- **GET** `/users`

### 5.2 创建用户

- **POST** `/users`

### 5.3 更新用户

- **PUT** `/users/{id}`

### 5.4 删除用户

- **DELETE** `/users/{id}`

### 5.5 更新用户状态

- **PATCH** `/users/{id}`

**业务规则：**

- 不得移除、迁出、禁用或删除某租户最后一个可用老板账号

### 5.6 创建密码重置记录

- **POST** `/users/{id}/password-resets`

## 六、订单管理

> Admin 看到的是跨租户订单数据，与 Tenant 的 `/orders` 共用同一资源路径，后端通过登录态区分权限范围。

### 6.1 获取订单列表

- **GET** `/orders`

### 6.2 获取订单详情

- **GET** `/orders/{id}`

**业务规则：**

- Admin 订单域只提供查单与审计能力
- Admin 不提供创建、导入、轮询、打印、催款或内部收款动作
- `orders.qrCodeToken` 仅作为 H5 公开入口字段查看，Admin 不负责生成或管理

## 七、收款记录

### 7.1 获取收款流水列表

- **GET** `/payments`

### 7.2 获取收款汇总统计

- **GET** `/payments/summary`

## 八、财务对账

### 8.1 获取对账汇总

- **GET** `/reconciliation/summary`

### 8.2 获取对账明细列表

- **GET** `/reconciliation/daily`

### 8.3 导出对账单

- **GET** `/reconciliation/export`

## 九、远景规划能力清单

以下能力当前未提供 Admin 联调接口，不作为 Swagger、contracts 或前端开发事实源。落地前需要重新确认业务语义、闭集枚举、传输结构与共享 contracts。

| 能力域         | 当前口径                              |
| -------------- | ------------------------------------- |
| 套餐计费       | 暂不提供 Admin 联调入口               |
| 合同管理       | 暂不提供 Admin 联调入口               |
| 账单发票       | 暂不提供 Admin 联调入口               |
| 服务商管理     | 暂不提供 Admin 联调入口               |
| 系统公告发布   | Tenant 公告接收已落地，Admin 仍未落地 |
| 工单管理       | 暂不提供 Admin 联调入口               |
| 平台角色与权限 | 当前 Admin 无 RBAC，暂不提供联调入口  |
| 操作日志       | 暂不提供 Admin 联调入口               |
| 安全设置       | 暂不提供 Admin 联调入口               |
| 告警规则       | 暂不提供 Admin 联调入口               |
| 系统配置       | 暂不提供 Admin 联调入口               |
