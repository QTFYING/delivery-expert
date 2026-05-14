# Admin 平台运营后台 — API 接口契约文档

> 本文档为 Admin（平台运营后台）前后端接口契约依据，覆盖全部业务模块。
> 生成日期：2026-04-07

---

## 目录

1. [通用约定](#一通用约定)
2. [认证 Auth](#二认证-auth4-个端点)
3. [控制台 Console](#三控制台-console1-个端点)
4. [仪表盘 Dashboard](#四仪表盘-dashboard5-个端点)
5. [租户中心 Tenant Center](#五租户中心-tenant-center15-个端点)
6. [用户管理 Users](#六用户管理-users6-个端点)
7. [订单管理 Orders](#七订单管理-orders2-个端点)
8. [收款记录 Payments](#八收款记录-payments2-个端点)
9. [财务对账 Reconciliation](#九财务对账-reconciliation3-个端点)
10. [套餐计费 Billing - Packages](#十套餐计费-billing---packages4-个端点)
11. [合同管理 Billing - Contracts](#十一合同管理-billing---contracts5-个端点)
12. [账单发票 Billing - Invoices](#十二账单发票-billing---invoices3-个端点)
13. [服务商管理 Service Providers](#十三服务商管理-service-providers4-个端点)
14. [系统公告 Notices](#十四系统公告-notices4-个端点)
15. [工单管理 Tickets](#十五工单管理-tickets5-个端点)
16. [角色管理 Security - Roles](#十六角色管理-security---roles4-个端点)
17. [操作日志 Security - Audit Logs](#十七操作日志-security---audit-logs1-个端点)
18. [安全设置 Security - Settings](#十八安全设置-security---settings8-个端点)
19. [告警规则 Ops - Alert Rules](#十九告警规则-ops---alert-rules5-个端点)
20. [系统配置 Ops - System Config](#二十系统配置-ops---system-config5-个端点)
21. [跨项目关联](#二十一跨项目关联)

---

## 一、通用约定

> [!NOTE]
> **全局规范指引**
> 关于统一下发的 `code/data/message` 响应体包装、分页参数的详细数据结构、金额传输要求与全局 `Http Status` 错误码等基础要素，在此单据内不再赘言，敬请直接调阅大本营总纲 **[api-architecture-overview.md]** 全局规范板块。
> 本档负责描述接口用途、角色边界、字段业务含义、状态流转与运营约束；闭集值以 `packages/types/src/enums` 为准，请求/响应结构、分页包装、`nullable` 与示例以 Swagger 与共享 `contracts` 为准。
> 本档不再维护与 Swagger 完全同构的机械参数表、字段表或分页包装镜像。

### 路径前缀规范

| 前缀                   | 域     | 说明                                 |
| ---------------------- | ------ | ------------------------------------ |
| `/auth/*`              | 认证   | 三端共用                             |
| `/platform/*`          | 平台   | Admin 专属聚合数据（仪表盘、控制台） |
| `/tenants/*`           | 租户   | 租户生命周期管理                     |
| `/users/*`             | 用户   | 跨租户用户管理                       |
| `/orders/*`            | 订单   | 跨租户订单管理                       |
| `/payments/*`          | 收款   | 跨租户收款流水                       |
| `/reconciliation/*`    | 对账   | 财务对账                             |
| `/billing/*`           | 计费   | 套餐、合同、账单                     |
| `/security/*`          | 安全   | 角色、审计日志、安全策略             |
| `/ops/*`               | 运维   | 告警规则、系统配置                   |
| `/notices/*`           | 公告   | 系统公告管理                         |
| `/tickets/*`           | 工单   | 工单管理                             |
| `/service-providers/*` | 服务商 | 外部服务商监管                       |

---

## 二、认证 Auth（4 个端点）

> 与 Tenant 端共用同一套 Auth。平台用户 `tenantId = null`。

### 2.1 登录

- **POST** `/auth/login`
- **是否鉴权**：否（`skipAuth: true`）

**契约类型：** 请求：`LoginRequest`；响应：`LoginResponse`

**Cookie：**

- 响应头通过 `Set-Cookie` 下发 `refreshToken`
- Cookie 属性：`HttpOnly`、`SameSite=Lax`
- HTTPS 场景优先使用 `__Host-refreshToken` + `Secure`

### 2.2 刷新令牌

- **POST** `/auth/refresh`
- **是否鉴权**：否（`skipAuth: true`）
- **描述**：令牌过期前 5 分钟自动触发；401 时也会静默刷新一次并重放原请求

**契约类型：** 请求：无 Body；响应：`RefreshTokenResponse`

**Cookie：**

- 成功刷新后会轮换 refreshToken
- 响应头重新写入新的 HttpOnly Refresh Cookie

### 2.3 退出登录

- **POST** `/auth/logout`
- **是否鉴权**：否（`skipAuth: true`）
- **描述**：服务端清理当前 refresh session，并清空 Refresh Cookie；若请求带有 accessToken，会一并加入黑名单

**契约类型：** 请求：无 Body；响应：`null`

### 2.4 获取当前用户信息

- **GET** `/auth/me`
- **是否鉴权**：是

**契约类型：** 响应：`AuthMeResponse`

---

## 三、控制台 Console（1 个端点）

### 3.1 获取控制台上下文

- **GET** `/platform/console`
- **描述**：获取当前登录用户的控制台元数据，用于侧边栏展示

**契约类型：** 响应：`ConsoleInfoResponse`

---

## 四、仪表盘 Dashboard（5 个端点）

### 4.1 获取平台核心指标

- **GET** `/platform/metrics`
- **描述**：仪表盘顶部的核心指标卡片数据

**契约类型：** 响应：`DashboardMetricItem[]`

### 4.2 获取平台待办事项

- **GET** `/platform/todos`
- **描述**：运营待办列表

**契约类型：** 响应：`PlatformTodoItem[]`

### 4.3 获取租户健康度

- **GET** `/platform/tenant-health`
- **描述**：租户健康度看板数据，用于表格展示

**契约类型：** 响应：`TenantHealthItem[]`

### 4.4 获取登录风险事件

- **GET** `/platform/risk-events`
- **描述**：近期安全风险告警

**契约类型：** 响应：`LoginRiskEventItem[]`

### 4.5 获取平台数据总览

- **GET** `/platform/overview`
- **描述**：平台数据总览页的汇总数据，覆盖租户增长趋势、续费风险等聚合结果

**契约类型：** 响应：`PlatformOverviewResponse`

**补充说明：**

- `growth` 表示增长趋势聚合视图
- `renewalRisks` 表示续费风险租户列表

---

## 五、租户中心 Tenant Center（15 个端点）

### 契约约定

- 租户中心相关闭集统一使用 `TenantStatus`、`TenantSortField`、`SortOrder`、`ReviewAction`、`FreezeAction`
- 本章节只保留租户生命周期、状态动作、收单配置兜底与运营语义，不再长期维护同构字段镜像

### 5.1 获取租户列表

- **GET** `/tenants`
- **描述**：平台侧分页获取租户列表，用于租户检索、状态筛选与运营巡检

**契约类型：** 请求：`TenantListQuery`；响应：`PaginatedResponse<TenantRecordItem>`

**业务说明：**

- 支持按关键词搜索，匹配租户名称、租户 ID、管理员
- 支持按租户状态筛选，并按既定排序字段升序或降序排列
- 列表项聚焦租户基础信息、联系地址、软件展示名称、软件版本级别、支付通道、商户数、账号数、本月流水、到期风险、最近活跃时间与当前状态
- `address` 公司联系地址
- `softwareVersion` 派生展示softwareName；`L1` 为基础版，`L2` 为标准版，`L3` 为高级版
- `serviceExpireAt` 是租户采购服务到期时间；`dueInDays` 不入库，由 `serviceExpireAt` 按当前日期派生，仅用于平台列表、排序和风险提示

### 5.2 创建租户

- **POST** `/tenants`
- **描述**：新建租户，并同步创建首个租户老板账号；租户初始状态为 `onboarding`

**契约类型：** 请求：`CreateTenantRequest`；响应：`TenantRecordItem`

**业务规则：**

- 创建后立即生成平台侧租户记录
- 创建时同步生成首个 `TENANT_OWNER` 账号
- 租户创建后状态保持 `onboarding`
- `serviceExpireAt` 表示租户采购服务到期时间；创建请求不再接收 `dueInDays`
- `channel` 表示首个开通的支付通道标识
- `softwareVersion` 表示租户采购的软件版本级别，当前闭集为 `L1`、`L2`、`L3`
- `admin` 表示老板姓名，同时回写租户展示字段
- `address` 表示租户联系地址，创建时必填，并写入租户主体资料
- `licenseNo` 为租户营业执照号，创建时必填，并写入租户主体资料
- `ownerAccount` 为首个老板登录账号，要求全局唯一
- `ownerPhone` 为首个老板手机号
- `ownerInitialPassword` 未传时，服务端使用默认初始密码，并要求首次登录修改密码
- 首个老板账号创建成功后，可直接登录 Tenant 端完成初始化配置
- 初始化配置不等于租户已正式开通线上收款；是否允许 H5 支付由支付配置状态单独决定

### 5.3 创建租户审核决议

- **POST** `/tenants/{id}/audit-decisions`
- **描述**：在指定租户下创建一条审核决议记录

**契约类型：** 请求：`CreateTenantAuditDecisionRequest`；响应：`TenantAuditDecisionResponse`

**业务规则：**

- `approve` 时状态流转为 `active`
- `reject` 时状态保持 `onboarding`，并记录 `rejectReason`

### 5.4 创建租户批量审核批次

- **POST** `/tenants/audit-batches`
- **描述**：批量通过多个待审核租户

**契约类型：** 请求：`CreateTenantAuditBatchRequest`；响应：`TenantBatchActionResponse`

### 5.5 创建租户续费记录

- **POST** `/tenants/{id}/renewals`
- **描述**：在指定租户下创建一条续费记录，可同时变更软件版本级别和服务到期时间

**契约类型：** 请求：`CreateTenantRenewalRequest`；响应：`TenantRenewalResponse`

**业务规则：**

- `serviceExpireAt` 为续费后生效的服务到期时间，由平台运营明确提交
- 本接口不再接收续费天数；季度、半年、整年、补偿延期等均归一为新的服务到期时间

### 5.6 更新租户状态

- **PATCH** `/tenants/{id}`
- **描述**：冻结或解冻指定租户

**契约类型：** 请求：`PatchTenantStatusRequest`；响应：`TenantStatusMutationResponse`

**业务规则：**

- `freeze` 时状态变为 `paused`
- `unfreeze` 时状态恢复为 `active`

### 5.7 创建租户批量状态变更批次

- **POST** `/tenants/status-change-batches`
- **描述**：批量冻结多个租户

**契约类型：** 请求：`CreateTenantStatusChangeBatchRequest`；响应：`TenantBatchActionResponse`

### 5.8 获取组织架构成员列表

- **GET** `/tenants/members`
- **描述**：跨租户查看所有成员

**契约类型：** 请求：`TenantMemberListQuery`；响应：`PaginatedResponse<TenantMemberItem>`

### 5.9 获取资质审核队列

- **GET** `/tenants/certifications`
- **说明**：该队列仅展示仍在审核流中的记录，即 `pending_initial_review / pending_secondary_review / pending_confirmation`

**契约类型：** 响应：`TenantCertificationRecordItem[]`

### 5.10 创建资质审核决议

- **POST** `/tenants/certifications/{id}/review-decisions`
- **说明**：在指定资质记录下创建一条审核决议，并推进资质审核状态流转

**契约类型：** 请求：`CreateTenantCertificationReviewDecisionRequest`；响应：`TenantCertificationReviewDecisionResponse`

**状态流转规则：**

- `pending_initial_review` + `approve` -> `pending_secondary_review`
- `pending_secondary_review` + `approve` -> `pending_confirmation`
- `pending_confirmation` + `approve` -> `approved`
- 任一待处理状态 + `reject` -> `rejected`

### 5.11 获取租户支付渠道配置列表

- **GET** `/tenants/payment-configs`
- **描述**：平台侧分页获取租户支付渠道配置列表，用于状态筛选、关键词搜索与兜底巡检

**契约类型：** 响应：`PaginatedResponse<TenantPaymentConfigListItem>`

**请求参数（Query）：** 支持 `page`、`pageSize`、`keyword`、`status`、`tenantStatus`

**补充说明：**

- `keyword` 可匹配租户名称、租户 ID 以及当前渠道主标识（对 `lakala` 即商户号）
- `status` 使用闭集 `TenantPaymentConfigStatus`
- 列表默认只返回已有支付渠道配置记录；`not_configured` 仅在单租户单渠道详情查询时作为虚拟态返回
- 支付渠道闭集当前包含 `lakala`、`shouqianba`、`pingan_bank`
- `shouqianba`、`pingan_bank` 已可查询配置快照；真实线上收款网关接入前不能切换为生效渠道

### 5.12 获取单租户单渠道配置详情

- **GET** `/tenants/{id}/payment-configs/{channel}`
- **描述**：查看单个租户指定支付渠道的配置快照；租户存在但该渠道未配置时返回 `status=not_configured`

**契约类型：** 响应：`TenantPaymentConfigSnapshot`

**补充说明：**

- `channel` 支持 `lakala`、`shouqianba`、`pingan_bank`
- `shouqianba`、`pingan_bank` 未配置时返回 `status=not_configured`，不因渠道名本身报错

### 5.13 强制停用单租户单渠道配置

- **POST** `/tenants/{id}/payment-configs/{channel}/disable`
- **描述**：平台兜底停用单租户指定渠道的线上收款配置，不清空该渠道已有配置内容

**契约类型：** 响应：`TenantPaymentConfigSnapshot`

### 5.14 切换单租户当前生效支付渠道

- **POST** `/tenants/{id}/payment-configs/{channel}/activate`
- **描述**：平台侧将指定渠道切为该租户当前生效支付渠道；后端先校验该渠道配置必须处于 `available`，且该渠道已有线上支付网关实现

**契约类型：** 响应：`TenantPaymentConfigSnapshot`

**补充说明：**

- 当前仅 `lakala` 允许激活为线上收款渠道；`shouqianba`、`pingan_bank` 在网关实现接入前会返回业务错误

---

## 六、用户管理 Users（6 个端点）

### 契约约定

- 用户所属侧统一使用闭集 `TenantSide`
- 用户状态统一使用闭集 `UserStatus`

### 6.1 获取用户列表

- **GET** `/users`
- **描述**：分页查询平台及租户用户，支持姓名、账号、手机号、租户、角色等条件搜索

**契约类型：** 请求：`UserListQuery`；响应：`PaginatedResponse<UserRecordItem>`

### 6.2 创建用户

- **POST** `/users`

**契约类型：** 请求：`UserUpsertRequest`；响应：`UserRecordItem`

**校验规则：**

- `account` 全局唯一
- `name`、`account`、`phone` 不可为空

### 6.3 更新用户

- **PUT** `/users/{id}`

**契约类型：** 请求：`UserUpsertRequest`；响应：`UserRecordItem`

**业务规则：**

- 不得移除某租户最后一个老板账号
- 不得迁出某租户最后一个老板账号
- 不得禁用某租户最后一个可用老板账号

### 6.4 删除用户

- **DELETE** `/users/{id}`

**契约类型：** 响应：`null`

**业务规则：**

- 不得删除某租户最后一个老板账号
- 不得删除某租户最后一个可用老板账号

### 6.5 更新用户状态

- **PATCH** `/users/{id}`
- **描述**：启用、禁用、锁定或解锁用户

**契约类型：** 请求：`UserStatusUpdateRequest`；响应：`UserRecordItem`

**业务规则：**

- 不得禁用某租户最后一个可用老板账号

### 6.6 创建密码重置记录

- **POST** `/users/{id}/password-resets`
- **描述**：管理员重置用户密码，用户下次登录需修改密码

**契约类型：** 请求：`CreateUserPasswordResetRequest`；响应：`CreateUserPasswordResetResponse`

---

## 七、订单管理 Orders（2 个端点）

> Admin 看到的是跨租户订单数据，与 Tenant 的 `/orders` 共用同一资源路径，后端通过 token 区分权限范围。
> Admin 端仅提供查单与审计能力，不提供创建、导入、轮询、催款等运营动作。
> `orders.qrCodeToken` 的业务语义等同 `h5EntryToken`；Admin 仅查看该 H5 公开入口字段，不负责生成或管理。

### 契约约定

- 订单状态统一使用闭集 `OrderStatus`
- 结算方式统一使用闭集 `OrderPayType`

### 7.1 获取订单列表

- **GET** `/orders`

**契约类型：** 请求：`AdminOrderListQuery`；响应：`PaginatedResponse<AdminOrderItem>`

### 7.2 获取订单详情

- **GET** `/orders/{id}`
- **描述**：查看单个订单的聚合详情、商品明细、H5 公开入口字段与审计所需字段

**契约类型：** 响应：`AdminOrderItem`

---

## 八、收款记录 Payments（2 个端点）

> 平台视角的跨租户收款流水汇总。

### 契约约定

- 收款流水状态统一使用闭集 `PaymentRecordStatus`

### 8.1 获取收款流水列表

- **GET** `/payments`

**契约类型：** 请求：`AdminPaymentListQuery`；响应：`PaginatedResponse<AdminPaymentRecordItem>`

### 8.2 获取收款汇总统计

- **GET** `/payments/summary`
- **描述**：收款页面顶部统计卡片数据

**契约类型：** 响应：`PaymentSummaryResponse`

---

## 九、财务对账 Reconciliation（3 个端点）

### 契约约定

- 平台侧对账状态统一使用闭集 `AdminReconciliationStatus`

### 9.1 获取对账汇总

- **GET** `/reconciliation/summary`
- **描述**：对账页面顶部统计指标

**契约类型：** 响应：`AdminReconciliationSummaryResponse`

### 9.2 获取对账明细列表

- **GET** `/reconciliation/daily`
- **描述**：按日 / 按租户聚合的对账明细

**契约类型：** 请求：`AdminReconciliationDailyQuery`；响应：`PaginatedResponse<AdminReconciliationDailyRecordItem>`

### 9.3 导出对账单

- **GET** `/reconciliation/export`
- **Content-Type**：`application/octet-stream`

**响应：** Excel 文件流

---

## 十、套餐计费 Billing - Packages（4 个端点）

### 契约约定

- 套餐状态统一使用闭集 `BillingPackageStatus`

### 10.1 获取套餐列表

- **GET** `/billing/packages`

**契约类型：** 响应：`PackagePlanItem[]`

### 10.2 创建套餐

- **POST** `/billing/packages`

**契约类型：** 请求：`CreatePackagePlanRequest`；响应：`PackagePlanItem`

### 10.3 更新套餐

- **PUT** `/billing/packages/{id}`

**契约类型：** 请求：`UpdatePackagePlanRequest`；响应：`PackagePlanItem`

### 10.4 删除套餐

- **DELETE** `/billing/packages/{id}`
- **描述**：删除套餐定义，不影响已签约租户

**契约类型：** 响应：`null`

---

## 十一、合同管理 Billing - Contracts（5 个端点）

### 契约约定

- 合同类型统一使用闭集 `ContractType`
- 合同状态统一使用闭集 `ContractStatus`

### 11.1 获取合同列表

- **GET** `/billing/contracts`

**契约类型：** 响应：`PaginatedResponse<ContractRecordItem>`

### 11.2 发起合同

- **POST** `/billing/contracts`
- **描述**：发起电子合同签署，系统生成合同编号并发送签署短信

**契约类型：** 请求：`CreateContractRequest`；响应：`CreateContractResponse`

**业务规则：**

- 合同编号格式为 `HT-{serviceStart去横线}-{序号}`
- 选择套餐后自动填入对应费用和费率

### 11.3 更新合同

- **PUT** `/billing/contracts/{id}`
- **描述**：更新合同信息，仅 `pending_signing / pending_archive` 状态可修改

**契约类型：** 请求：`UpdateContractRequest`；响应：`ContractActionResponse`

**校验规则：**

- `active` 状态禁止修改

### 11.4 创建合同审批记录

- **POST** `/billing/contracts/{id}/approvals`
- **描述**：在指定合同下创建一条审批记录，状态流转为 `active`

**契约类型：** 请求：`CreateContractApprovalRequest`；响应：`ContractActionResponse`

**状态流转：** `pending_signing` -> `active`

### 11.5 创建合同终止记录

- **POST** `/billing/contracts/{id}/terminations`
- **描述**：在指定合同下创建一条终止记录

**契约类型：** 请求：`CreateContractTerminationRequest`；响应：`ContractRecordItem`

**校验规则：**

- 仅 `active` 状态可终止

---

## 十二、账单发票 Billing - Invoices（3 个端点）

### 契约约定

- 发票状态统一使用闭集 `InvoiceStatus`

### 12.1 获取账单列表

- **GET** `/billing/invoices`

**契约类型：** 响应：`PaginatedResponse<InvoiceRecordItem>`

### 12.2 开具发票

- **POST** `/billing/invoices`
- **描述**：为指定结算周期开具发票

**契约类型：** 请求：`CreateInvoiceRequest`；响应：`CreateInvoiceResponse`

**业务规则：**

- 创建开票记录后初始状态为 `pending_issue`
- 只有在发票真正开具完成后，状态才会流转为 `issued`

### 12.3 更新发票状态（作废）

- **PATCH** `/billing/invoices/{id}`
- **描述**：通过部分更新发票资源，将已开具发票作废

**契约类型：** 请求：`PatchInvoiceStatusRequest`；响应：`null`

**校验规则：**

- 仅 `issued` 状态可作废
- 作废后状态变为 `voided`

---

## 十三、服务商管理 Service Providers（4 个端点）

> Admin 负责平台级服务商接入管理，Tenant 端负责业务级服务商协作。

### 契约约定

- 服务商状态统一使用闭集 `ServiceProviderStatus`

### 13.1 获取服务商列表

- **GET** `/service-providers`

**契约类型：** 响应：`ServiceProviderRecordItem[]`

### 13.2 新增服务商

- **POST** `/service-providers`
- **描述**：接入新的平台级服务商

**契约类型：** 请求：`CreateServiceProviderRequest`；响应：`ServiceProviderRecordItem`

### 13.3 更新服务商

- **PUT** `/service-providers/{id}`
- **描述**：更新服务商信息或状态

**契约类型：** 请求：`UpdateServiceProviderRequest`；响应：`ServiceProviderRecordItem`

### 13.4 移除服务商

- **DELETE** `/service-providers/{id}`
- **描述**：移除已接入的服务商

**契约类型：** 响应：`null`

**校验规则：**

- `active` 且有活跃租户依赖时，禁止直接删除，需先下线

---

## 十四、系统公告 Notices（4 个端点）

> Admin 是公告的发布方，Tenant 是接收方。

### 契约约定

- 公告状态统一使用闭集 `NoticeStatus`
- 发布时间策略统一使用闭集 `PublishTiming`

### 14.1 获取公告列表

- **GET** `/notices`

**契约类型：** 响应：`NoticeRecordItem[]`

### 14.2 创建公告

- **POST** `/notices`
- **描述**：创建新公告，可直接发布或存为草稿

**契约类型：** 请求：`NoticeUpsertRequest`；响应：`NoticeRecordItem`

### 14.3 更新公告

- **PUT** `/notices/{id}`

**契约类型：** 请求：`NoticeUpsertRequest`；响应：`NoticeRecordItem`

### 14.4 删除公告

- **DELETE** `/notices/{id}`
- **描述**：删除公告，仅草稿状态可直接删除，已发布需先下架

**契约类型：** 响应：`null`

**校验规则：**

- 草稿状态可直接删除
- 已发布状态需先标记为下架（`status = 'offline'`）再删除

---

## 十五、工单管理 Tickets（5 个端点）

### 契约约定

- 工单状态统一使用闭集 `TicketStatus`

### 15.1 获取工单列表

- **GET** `/tickets`

**契约类型：** 响应：`PaginatedResponse<TicketRecordItem>`

### 15.2 导出工单

- **GET** `/tickets/export`
- **Content-Type**：`application/octet-stream`

**响应：** Excel 文件流

### 15.3 创建工单回复

- **POST** `/tickets/{id}/replies`
- **描述**：在指定工单下创建一条回复记录

**契约类型：** 请求：`CreateTicketReplyRequest`；响应：`TicketReplyResult`

### 15.4 创建工单分配记录

- **POST** `/tickets/{id}/assignments`
- **描述**：在指定工单下创建一条分配记录，将工单分配给指定处理人或处理组

**契约类型：** 请求：`CreateTicketAssignmentRequest`；响应：`TicketAssignmentResponse`

**状态流转：** `pending` -> `processing`

### 15.5 创建工单关闭记录

- **POST** `/tickets/{id}/closures`
- **描述**：在指定工单下创建一条关闭记录，标记为 `resolved`

**契约类型：** 请求：`CreateTicketClosureRequest`；响应：`TicketClosureResponse`

**状态流转：** `processing` -> `resolved`

---

## 十六、角色管理 Security - Roles（4 个端点）

### 契约约定

- 平台角色侧别固定使用闭集 `TenantSide` 的 `platform` 取值

### 16.1 获取角色列表

- **GET** `/security/roles`

**契约类型：** 响应：`PlatformRoleTemplateItem[]`

### 16.2 创建角色

- **POST** `/security/roles`

**契约类型：** 请求：`CreatePlatformRoleTemplateRequest`；响应：`PlatformRoleTemplateItem`

**校验规则：**

- `name` 不可与已有角色重名
- `permissions` 至少包含一项

### 16.3 更新角色

- **PUT** `/security/roles/{id}`

**契约类型：** 请求：`UpdatePlatformRoleTemplateRequest`；响应：`PlatformRoleTemplateItem`

**校验规则：**

- 如果有用户关联此角色，则不允许变更 `side`
- 角色名变更时需级联更新关联用户的 `role` 字段

### 16.4 删除角色

- **DELETE** `/security/roles/{id}`

**契约类型：** 响应：`null`

**校验规则：**

- 如果有用户关联此角色，禁止删除，返回 `409`

---

## 十七、操作日志 Security - Audit Logs（1 个端点）

### 契约约定

- `targetType` 与 `result` 的闭集值分别来自 `AuditTargetType`、`AuditResult`

### 17.1 获取操作日志列表

- **GET** `/security/audit-logs`
- **描述**：查询平台操作审计日志，支持搜索和日期范围筛选

**契约类型：** 请求：`AuditLogListQuery`；响应：`PaginatedResponse<PlatformAuditRecordItem>`

---

## 十八、安全设置 Security - Settings（8 个端点）

### 18.1 获取安全策略列表

- **GET** `/security/policies`

**契约类型：** 响应：`SecurityPolicyItem[]`

### 18.2 更新安全策略状态

- **PUT** `/security/policies/{id}`

**契约类型：** 请求：`UpdateSecurityPolicyRequest`；响应：`SecurityPolicyItem`

### 18.3 获取 IP 白名单

- **GET** `/security/ip-whitelist`

**契约类型：** 响应：`IpWhitelistItem[]`

### 18.4 新增 IP 白名单

- **POST** `/security/ip-whitelist`

**契约类型：** 请求：`CreateIpWhitelistRequest`；响应：`IpWhitelistItem`

### 18.5 更新 IP 白名单

- **PUT** `/security/ip-whitelist/{id}`

**契约类型：** 请求：`UpdateIpWhitelistRequest`；响应：`IpWhitelistItem`

### 18.6 删除 IP 白名单

- **DELETE** `/security/ip-whitelist/{id}`

**契约类型：** 响应：`null`

### 18.7 获取安全周期策略

- **GET** `/security/period-policies`

**契约类型：** 响应：`SecurityPeriodPolicy`

### 18.8 更新安全周期策略

- **PUT** `/security/period-policies`

**契约类型：** 请求：`SecurityPeriodPolicy`；响应：`SecurityPeriodPolicy`

---

## 十九、告警规则 Ops - Alert Rules（5 个端点）

### 19.1 获取告警规则列表

- **GET** `/ops/alert-rules`

**契约类型：** 响应：`AlertRuleItem[]`

### 19.2 创建告警规则

- **POST** `/ops/alert-rules`

**契约类型：** 请求：`CreateAlertRuleRequest`；响应：`AlertRuleItem`

### 19.3 更新告警规则

- **PUT** `/ops/alert-rules/{id}`

**契约类型：** 请求：`UpdateAlertRuleRequest`；响应：`AlertRuleItem`

### 19.4 更新告警规则启用状态

- **PATCH** `/ops/alert-rules/{id}`

**契约类型：** 请求：`PatchAlertRuleStatusRequest`；响应：`AlertRuleItem`

### 19.5 删除告警规则

- **DELETE** `/ops/alert-rules/{id}`

**契约类型：** 响应：`null`

---

## 二十、系统配置 Ops - System Config（5 个端点）

### 20.1 获取全局配置列表

- **GET** `/ops/system-configs`

**契约类型：** 响应：`SystemConfigItem[]`

### 20.2 获取服务接入配置列表

- **GET** `/ops/service-configs`

**契约类型：** 响应：`ServiceConfigItem[]`

### 20.3 创建服务接入配置

- **POST** `/ops/service-configs`

**契约类型：** 请求：`CreateServiceConfigRequest`；响应：`ServiceConfigItem`

### 20.4 更新服务接入配置

- **PUT** `/ops/service-configs/{id}`

**契约类型：** 请求：`UpdateServiceConfigRequest`；响应：`ServiceConfigItem`

### 20.5 删除服务接入配置

- **DELETE** `/ops/service-configs/{id}`

**契约类型：** 响应：`null`

---

## 二十一、跨项目关联

### 与 Tenant 端的关联

| Admin 操作               | 关联的 Tenant 端                                                           |
| ------------------------ | -------------------------------------------------------------------------- |
| 创建租户 + 审核通过      | Tenant 端可登录使用                                                        |
| 冻结租户                 | Tenant 端登录后提示被冻结                                                  |
| 续费租户                 | Tenant 端套餐和有效期更新                                                  |
| 创建/管理用户            | Tenant 端用户列表同步更新                                                  |
| 查看/兜底支付渠道配置    | Tenant 端 `GET /settings/payment-configs/{channel}` 的状态由平台兜底可见   |
| 固定角色与权限树只读接口 | Tenant `GET /settings/roles`、`GET /settings/permissions` 只读返回固定枚举 |
| 发布公告                 | Tenant 端 `GET /notifications` 接收                                        |
| 跨租户订单/流水查看      | 数据来源于各 Tenant 的订单和支付                                           |

### 与 H5 端的关联

| Admin 数据                                                       | 关联的 H5 端                                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /tenants/{id}/payment-configs/{channel}` 等支付渠道配置接口 | 影响对应租户 H5 页面 `paymentAction.canInitiate` 与 `POST /pay/:token/initiate` 是否放行       |
| `GET /orders/{id}` 订单详情                                      | 可查看 `orders.qrCodeToken`（业务语义等同 `h5EntryToken`）对应的订单公开入口，仅用于排障与核查 |
| `GET /payments` 收款流水                                         | 包含 H5 在线支付成功的记录                                                                     |
| `GET /reconciliation/daily` 对账明细                             | 包含 H5 在线支付与现金核销产生的到账数据                                                       |

### 数据隔离说明

Admin 与 Tenant 使用**相同的资源路径**（如 `/orders`、`/users`），后端通过 Token 中的身份信息区分：

| 调用方 | tenantId  | 数据范围             |
| ------ | --------- | -------------------- |
| Admin  | `null`    | 跨租户，返回所有数据 |
| Tenant | `TEN-xxx` | 仅返回该租户的数据   |
