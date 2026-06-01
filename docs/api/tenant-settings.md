# Tenant 设置

> 本文件承接 Tenant 设置核心功能的业务语义，包括单角色 RBAC、用户、通用设置、主体资料、打印配置、支付渠道配置、操作日志与资质提交
> 若本文件的领域细节与 [tenant-api-doc.md](./tenant-api-doc.md) 的全局边界冲突，以全局边界为准

## 一、系统设置

> Tenant 设置域采用单角色功能权限 RBAC。角色是长期权限包，权限点是服务端开放的 `TenantPermissionCode` 闭集；本文件只承接 `tenant-api-doc.md` 已确认的设置域细节。

### 契约约定

- 用户状态统一使用闭集 `UserSimpleStatus`
- 租户侧权限编码统一使用闭集 `TenantPermissionCode`
- 租户侧权限业务域统一使用闭集 `TenantPermissionDomain`

### 1.1 获取角色列表

- **GET** `/settings/roles`
- **权限**：`settings.roles.manage`

**契约类型：** 响应：`TenantRoleAccount[]`

### 1.2 创建自定义角色

- **POST** `/settings/roles`
- **权限**：`settings.roles.manage`

**契约类型：** 请求：`CreateTenantRoleRequest`；响应：`TenantRoleAccount`

**业务规则：**

- 角色是权限包，角色内的 `permissions` 是服务端已定义的 `TenantPermissionCode[]`
- 请求只提交角色名称、描述和 `permissionCodes`，不提交前端菜单树或路由树
- 角色名称在当前租户未删除角色内唯一
- `permissionCodes` 必须全部来自服务端 `TenantPermissionCode` 闭集
- 自定义角色至少包含一个权限编码
- 创建角色本身不影响既有用户权限快照；后续绑定该角色或调整角色权限时，应告知受影响用户权限已变更，并提升对应用户的 `permissionVersion`

### 1.3 更新自定义角色

- **PUT** `/settings/roles/{id}`
- **权限**：`settings.roles.manage`

**契约类型：** 请求：`UpdateTenantRoleRequest`；响应：`TenantRoleAccount`

**业务规则：**

- `id` 必须属于当前登录态 `tenantId`
- 第一版内置角色不可编辑权限
- 自定义角色更新权限后，会触发 `4006`提醒

### 1.4 删除自定义角色

- **DELETE** `/settings/roles/{id}`
- **权限**：`settings.roles.manage`

**契约类型：** 响应：`null`

**业务规则：**

- 内置角色不可删除
- 已绑定用户的自定义角色不可删除
- 删除为软删除，不物理清除历史记录

### 1.5 获取权限能力树

- **GET** `/settings/permissions`
- **权限**：`settings.roles.manage`

**契约类型：** 响应：`TenantPermissionTreeResponse`

**结构语义：**

- 返回服务端定义的权限能力树，供前端渲染角色授权页面
- 该结构不是前端菜单树、路由树或按钮配置
- `version` 表示服务端权限列表版本，随服务端权限定义发布
- `domains[].domain` 表示权限业务域，例如 `orders`、`finance`、`settings`
- `domains[].description` 是服务端业务域说明，不代表前端菜单名称或路由名称
- `domains[].permissions[].code` 是真正可授权的权限编码
- `domains[].permissions[].description` 是服务端权限能力说明，不代表前端按钮文案
- 前端创建或更新角色时只能提交 `permissionCodes`

### 1.6 获取用户列表

- **GET** `/settings/users`
- **权限**：`settings.users.manage`

**契约类型：** 响应：`TenantSettingsUser[]`

### 1.7 创建用户

- **POST** `/settings/users`
- **权限**：`settings.users.manage`

**契约类型：** 请求：`CreateTenantUserRequest`；响应：`TenantSettingsUser`

**校验规则：**

- Tenant 用户管理可选提交 `account` 作为登录账号；未提交时服务端使用 `phone` 作为登录账号
- 有效 Tenant 用户手机号 `phone` 在全平台租户范围内唯一；平台用户手机号不参与该唯一规则
- 请求使用 `roleId` 绑定当前租户内的角色，不再接收旧 `TenantRole` 作为前端角色事实源
- `roleId` 必须属于当前登录态 `tenantId`
- 新建用户初始状态为 `active`
- Tenant 端新建用户不由前端录入合规密码；服务端统一设置初始密码为 `123456`
- 新建用户必须标记为首次登录需修改密码；首次登录响应 `LoginResponse.user.requiresPasswordReset=true`

### 1.8 更新用户

- **PUT** `/settings/users/{id}`
- **权限**：`settings.users.manage`

**契约类型：** 请求：`UpdateTenantUserRequest`；响应：`TenantSettingsUser`

**校验规则：**

- 不得移除当前租户最后一个老板账号
- 不得禁用当前租户最后一个可用老板账号
- 如更新为有效 Tenant 用户，手机号 `phone` 不能与其他未删除且可用的 Tenant 用户重复
- 如更新 `roleId`，目标角色必须属于当前登录态 `tenantId`
- 自定义角色更新权限后，会触发 `4006`提醒

### 1.9 删除用户

- **DELETE** `/settings/users/{id}`
- **权限**：`settings.users.manage`

**契约类型：** 响应：`null`

**校验规则：**

- TENANT_OWNER 角色用户不可删除自己
- 不得删除当前租户最后一个老板账号
- 不得删除当前租户最后一个可用老板账号
- 实际为软删除

### 1.10 更新用户状态

- **PATCH** `/settings/users/{id}`
- **权限**：`settings.users.manage`

**契约类型：** 请求：`TenantUserStatusUpdateRequest`；响应：`TenantSettingsUser`

**校验规则：**

- 不得禁用当前租户最后一个可用老板账号

### 1.11 获取通用配置

- **GET** `/settings/general`
- **权限**：`settings.general.manage`

**契约类型：** 响应：`TenantGeneralSettings`

**账期设置边界：**

- 服务端返回“平台默认值 + 租户覆盖值”的合并结果
- `TenantGeneralSettings.qrCodeExpiry` 表示订单可支付有效期，单位为天
- 本接口不返回或保存租户主体信息；租户主体资料统一由租户主体资料接口承载
- 当前仅使用 `creditRemindDays` 控制账期到期提醒提前天数
- 本期不新增 `GET /settings/credit-rules` 或 `PUT /settings/credit-rules`
- 修改通用设置默认只影响后续查询提醒口径或新导入订单，不批量重算历史订单的 `creditDays / dueDate`

### 1.12 保存通用配置

- **PUT** `/settings/general`
- **权限**：`settings.general.manage`

**契约类型：** 请求：`UpdateTenantGeneralSettingsRequest`；响应：`TenantGeneralSettings`

**账期设置边界：**

- 仅更新当前租户的通知与业务偏好覆盖层，不直接修改平台默认配置，也不修改企业主体字段
- `UpdateTenantGeneralSettingsRequest.qrCodeExpiry` 表示订单可支付有效期，传入和保存的都是天数
- 本接口不保存月结、周结、普通账期的独立规则表
- 本期不新增 `/settings/credit-rules`
- 保存设置后不默认批量重算历史订单

### 1.13 获取当前租户主体资料

- **GET** `/tenant/profile`
- **权限**：`tenant.profile.read`

**契约类型：** 响应：`TenantProfile`

**业务规则：**

- 获取当前登录态所属租户的主体资料；该接口只读，不承载当前用户资料语义
- 租户主体资料不返回平台侧派生字段 `dueInDays`

### 1.14 获取打印配置列表

- **GET** `/settings/printing`
- **权限**：`settings.printing.read`

**契约类型：** 响应：`GetPrintingConfigListResponse`

**关键说明：**

- 返回当前租户下所有导入映射模板对应的打印配置摘要视图
- 服务端只返回打印配置外围元信息，不解析 `config` 内部模板结构
- 列表页用于告诉前端“哪些映射模板已有自定义配置，哪些仍使用默认模板”
- 服务端持久化维度为 `tenantId + importTemplateId`

### 1.15 获取单张映射模板的打印配置

- **GET** `/settings/printing/{importTemplateId}`
- **权限**：`settings.printing.read`

**契约类型：** 响应：`GetPrintingConfigDetailResponse`

**关键说明：**

- `importTemplateId` 为当前租户下的导入映射模板 ID
- `config` 为前端维护的完整打印配置快照
- 服务端只负责按租户和 `importTemplateId` 维度持久化与回传
- 服务端持久化维度为 `tenantId + importTemplateId`

### 1.16 保存单张映射模板的打印配置

- **PUT** `/settings/printing/{importTemplateId}`
- **权限**：`settings.printing.update`

**契约类型：** 请求：`UpdatePrintingConfigRequest`；响应：`UpdatePrintingConfigResponse`

**关键说明：**

- `importTemplateId` 为当前租户下的导入映射模板 ID
- 服务端按 `tenantId + importTemplateId` 维度保存黑盒打印配置
- 若该映射模板此前没有自定义配置，则本次保存后 `hasCustomConfig=true`
- 保存接口仅返回最小结果摘要；若前端需要最新完整配置，请重新调用 `GET /settings/printing/{importTemplateId}`
- 不支持删除打印配置；未配置时由前端回退默认模板
- 服务端不承担模板字段级语义校验，也不负责实际打印动作

### 1.17 获取操作日志

- **GET** `/settings/audit-logs`
- **权限**：`settings.audit_logs.read`

**契约类型：** 请求：`TenantAuditLogQuery`；响应：`TenantAuditLogListResponse`

### 1.18 获取支付渠道配置列表

- **GET** `/settings/payment-configs`
- **权限**：`settings.payment_configs.read`

**契约类型：** 响应：`GetTenantPaymentConfigListResponse`

**补充说明：**

- 获取当前租户的支付渠道配置摘要列表，以及当前生效支付渠道
- `activePaymentChannel` 表示当前付款链路实际使用的渠道，允许为 `null`
- 列表项只返回渠道摘要，不返回整份渠道专属配置
- 支付渠道闭集当前包含 `lakala`、`shouqianba`、`pingan_bank`
- `shouqianba`、`pingan_bank` 已可作为配置资源查询；真实线上收款网关接入前不能切换为生效渠道

### 1.19 获取单渠道支付配置详情

- **GET** `/settings/payment-configs/{channel}`
- **权限**：`settings.payment_configs.read`

**契约类型：** 响应：`TenantPaymentConfigSnapshot`

**补充说明：**

- 获取当前租户指定支付渠道的配置详情；若该渠道尚未配置，返回 `status=not_configured`，不返回 404
- 返回值仅包含事实字段，不返回按钮展示策略字段
- `channel` 为正式资源维度，不再把 `lakala` 写死为接口名
- `config` 内仅返回该渠道的专属字段；`lakala` 使用 `merchantNo`、`terminalNo`
- `shouqianba`、`pingan_bank` 未配置时返回 `status=not_configured`，不因渠道名本身报错

### 1.20 保存单渠道支付配置

- **PUT** `/settings/payment-configs/{channel}`
- **权限**：`settings.payment_configs.manage`

**契约类型：** 请求：`UpsertTenantPaymentConfigRequest`；响应：`TenantPaymentConfigSnapshot`

**补充说明：**

- 保存当前租户指定支付渠道的配置；已接入网关的渠道按本地字段完整性校验，未接入网关的渠道可保存黑盒配置但保持 `invalid`
- 若路径已使用 `{channel}`，请求体不再重复传 `channel`
- `config` 仅承载该渠道的专属配置结构
- `lakala.config` 中，`merchantNo` 必填，`terminalNo` 可选
- `shouqianba`、`pingan_bank` 当前未接入，保存后返回 `invalid`，并写入 `invalidReason=渠道尚未接入，暂时不支持该支付渠道配置。`
- 若本次保存与当前值完全一致，可按幂等成功处理
- `available` 不代表拉卡拉已完成资质验证；拉卡拉官方未提供独立配置校验接口，真实商户资质问题只能在首次支付建单时暴露
- H5 聚合收银台首次建单若明确返回商户号、商户资质或商户权限类错误，后端会将该渠道配置降级为 `invalid` 并写入 `invalidReason`
- 当前 H5 聚合收银台不下发 `terminalNo`，因此终端号相关错误不作为 H5 渠道配置无效依据

### 1.21 停用单渠道支付配置

- **POST** `/settings/payment-configs/{channel}/disable`
- **权限**：`settings.payment_configs.manage`

**契约类型：** 响应：`TenantPaymentConfigSnapshot`

### 1.22 切换当前生效支付渠道

- **POST** `/settings/payment-configs/{channel}/activate`
- **权限**：`settings.payment_configs.manage`

**契约类型：** 响应：`TenantPaymentConfigSnapshot`

**补充说明：**

- 将指定渠道切换为当前租户的生效支付渠道；后端先校验该渠道配置必须处于 `available`，且该渠道已有线上支付网关实现
- `activate` 只表示“切换当前生效支付渠道”，不等于修改渠道配置状态
- 同一时刻只能有一个 `activePaymentChannel`
- 当前仅 `lakala` 允许激活为线上收款渠道；`shouqianba`、`pingan_bank` 在网关实现接入前会返回业务错误

## 二、资质认证

> Tenant 提交资质材料，Admin 在平台侧审核资质认证。

### 契约约定

- 资质状态统一使用闭集 `TenantCertificationStatus`
- Tenant 侧只能查询和提交当前租户自己的资质认证材料
- Admin 侧审核决议由 Admin 文档承接，Tenant 不直接推进审核状态

### 2.1 查询当前租户资质认证状态

- **GET** `/tenants/certification`
- **权限**：`tenant.certification.manage`

**契约类型：** 响应：`TenantCertificationStatusResult`

### 2.2 提交当前租户资质认证材料

- **POST** `/tenants/certification`
- **权限**：`tenant.certification.manage`

**契约类型：** 请求：`TenantCertificationSubmitRequest`；响应：`TenantCertificationSubmitResponse`

**业务规则：**

- 提交材料只作用于当前登录态 `tenantId`
- 审核通过、驳回和复核状态由 Admin 审核流程产生
