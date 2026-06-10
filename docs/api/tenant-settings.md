# Tenant 设置

> 本文件只补充 Tenant 设置域中无法从 Swagger 与共享 `contracts` 直接推导的业务边界
> 请求/响应结构、分页、`nullable` 与示例以 Swagger 和共享 `contracts` 为准

## 一、角色与用户

Tenant 设置域采用单角色功能权限 RBAC。角色是长期权限包，权限点是服务端开放的 `TenantPermissionCode` 闭集。

### 1.1 获取角色列表

- **GET** `/settings/roles`

### 1.2 创建自定义角色

- **POST** `/settings/roles`

**业务规则：**

- 角色内的权限只能来自服务端已定义的 `TenantPermissionCode`
- 前端菜单树、路由树或按钮配置不作为角色权限事实源
- 创建角色本身不影响既有用户权限快照

### 1.3 更新自定义角色

- **PUT** `/settings/roles/{id}`

**业务规则：**

- 内置角色不可编辑权限
- 自定义角色更新权限后，需要通过 `4006` 或权限版本变化提醒受影响用户刷新权限快照

### 1.4 删除自定义角色

- **DELETE** `/settings/roles/{id}`

**业务规则：**

- 内置角色不可删除
- 已绑定用户的自定义角色不可删除

### 1.5 获取权限能力树

- **GET** `/settings/permissions`

**补充说明：**

- 返回服务端定义的权限能力树，不是前端菜单树、路由树或按钮配置
- 前端创建或更新角色时只能提交权限编码

### 1.6 获取用户列表

- **GET** `/settings/users`

### 1.7 创建用户

- **POST** `/settings/users`

**业务规则：**

- 未提交 `account` 时服务端使用 `phone` 作为登录账号
- 有效 Tenant 用户手机号在全平台租户范围内唯一，平台用户手机号不参与该唯一规则
- Tenant 端新建用户使用服务端默认初始密码，并要求首次登录修改密码

### 1.8 更新用户

- **PUT** `/settings/users/{id}`

**业务规则：**

- 不得移除或禁用当前租户最后一个可用老板账号
- 如更新 `roleId`，目标角色必须属于当前登录态租户

### 1.9 删除用户

- **DELETE** `/settings/users/{id}`

**业务规则：**

- 不得删除当前租户最后一个老板账号或最后一个可用老板账号
- 删除为软删除

### 1.10 更新用户状态

- **PATCH** `/settings/users/{id}`

**业务规则：**

- 不得禁用当前租户最后一个可用老板账号

### 1.11 更新用户信息

- **PATCH** `/auth/me`

**业务规则：**

- `avatarUploadId` 必须属于当前登录用户，且场景为 `user_avatar`

## 二、通用设置与主体资料

### 2.1 获取通用配置

- **GET** `/settings/general`

### 2.2 保存通用配置

- **PUT** `/settings/general`

**业务规则：**

- 通用配置采用“平台默认值 + 租户覆盖值”的合并模型
- `qrCodeExpiry` 表示订单从下单日期起算的可支付有效期，单位为自然日
- 当前仅使用 `creditRemindDays` 控制账期到期提醒提前天数
- 保存设置后不默认批量重算历史订单的 `creditDays / dueDate`

### 2.3 获取当前租户主体资料

- **GET** `/tenant/profile`

**业务规则：**

- 本接口只读当前登录态所属租户的主体资料，不承载当前用户资料语义

## 三、打印配置

### 3.1 获取打印配置列表

- **GET** `/settings/printing`

### 3.2 获取单张映射模板的打印配置

- **GET** `/settings/printing/{importTemplateId}`

### 3.3 保存单张映射模板的打印配置

- **PUT** `/settings/printing/{importTemplateId}`

**业务规则：**

- 打印配置按 `tenantId + importTemplateId` 持久化
- `config` 是前端维护的完整打印配置快照，服务端只做黑盒保存和回传
- 服务端不解析模板内部结构，不承担模板字段级语义校验，也不负责实际打印动作

## 四、操作日志与支付渠道

### 4.1 获取操作日志

- **GET** `/settings/audit-logs`

### 4.2 获取支付渠道配置列表

- **GET** `/settings/payment-configs`

### 4.3 获取单渠道支付配置详情

- **GET** `/settings/payment-configs/{channel}`

### 4.4 保存单渠道支付配置

- **PUT** `/settings/payment-configs/{channel}`

**业务规则：**

- 支付渠道以 `channel` 为资源维度
- `activePaymentChannel` 表示当前付款链路实际使用的渠道，允许为 `null`
- 未接入真实线上收款网关的渠道可保存黑盒配置，但不能切换为生效渠道
- 拉卡拉官方未提供独立配置校验接口；真实商户资质问题可能在首次支付建单时暴露，并导致渠道配置降级

### 4.5 停用单渠道支付配置

- **POST** `/settings/payment-configs/{channel}/disable`

### 4.6 切换当前生效支付渠道

- **POST** `/settings/payment-configs/{channel}/activate`

**业务规则：**

- 同一时刻只能有一个 `activePaymentChannel`
- 只有已接入且处于可用状态的线上收款渠道允许激活
- 当前仅 `lakala` 允许激活为线上收款渠道

## 五、资质认证

### 5.1 查询当前租户资质认证状态

- **GET** `/tenants/certification`

### 5.2 提交当前租户资质认证材料

- **POST** `/tenants/certification`

**业务规则：**

- 提交材料只作用于当前登录态租户
- 审核通过、驳回和复核状态由 Admin 审核流程产生
