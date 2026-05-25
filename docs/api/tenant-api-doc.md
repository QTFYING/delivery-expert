# Tenant 商户 SaaS 端 — API 接口契约文档

> 本文档为 Tenant（商户端）前后端接口契约依据，覆盖全部业务模块。
> 生成日期：2026-04-07

---

## 目录

1. 通用约定
2. 认证模块 Auth
3. 订单模块 Orders
4. 支付与核销 Payment
5. 财务对账 Finance
6. 账期管理与内部收款 Credit
7. 数据分析 Analytics
8. 系统设置 Settings
9. 通知 Notifications
10. 资质提交 Certification
11. 跨项目关联

---

## 一、通用约定

> [!NOTE]
> **全局规范指引**
> 关于统一下发的 `code/data/message` 响应体包装、分页参数的请求与返回体指引、全局 `Http Status` 错误码机制以及环境拦截要求，请直接翻阅架构总览 **[api-architecture-overview.md]** 的第二章。
> 本档负责描述 Tenant 端业务语义、角色边界、状态含义、协作约束与关键流程；枚举值以 `packages/types/src/enums` 为准，请求/响应结构、分页包装、`nullable` 与示例以 Swagger 与共享 `contracts` 为准。
> 本档不再维护与 Swagger 完全同构的机械字段定义、参数表或分页包装镜像。

### 1.6 角色与来源标识

- 租户侧角色统一使用 `TenantRole`。
- 认证来源标识统一使用 `AuthSourceTag`。

| 角色              | 中文名 | 说明                               |
| ----------------- | ------ | ---------------------------------- |
| `TENANT_OWNER`    | 管理员 | 全部权限，包含员工配置与财务全览   |
| `TENANT_OPERATOR` | 打单员 | 处理订单导入、打印、发货及催款操作 |
| `TENANT_FINANCE`  | 财务   | 负责现金线下核销、对账单审计处理   |
| `TENANT_VIEWER`   | 访客   | 只读，用于审计与只读查看流水       |

---

## 二、认证模块 Auth（5 个）

> 三端（Admin / Tenant / H5）共用同一套 Auth，后端通过 `user.tenantId` 区分身份。

### 2.1 登录

- **POST** `/auth/login`
- **是否鉴权**：否（`skipAuth: true`）

**契约类型：** 请求：`LoginRequest`；响应：`LoginResponse`

**业务规则：**

- 租户状态为 `active` 时，按现有租户角色正常登录
- 租户状态为 `onboarding` 时，仅 `TENANT_OWNER` 允许登录 Tenant 端
- `TENANT_OWNER` 在 `onboarding` 状态下登录 Tenant 端，仅用于初始化配置，不表示租户已正式开通全部业务能力
- 租户状态为 `onboarding` 时，`TENANT_OPERATOR`、`TENANT_FINANCE`、`TENANT_VIEWER` 不允许登录

**Cookie：**

- 响应头通过 `Set-Cookie` 下发 `refreshToken`
- Cookie 属性：`HttpOnly`、`SameSite=Lax`
- HTTPS 场景优先使用 `__Host-refreshToken` + `Secure`

前端展示名称、来源标记等消费侧派生字段以共享 Auth contracts 为准，不在 API 语义文档中重复定义。

### 2.2 刷新令牌

- **POST** `/auth/refresh`
- **是否鉴权**：否（`skipAuth: true`）
- **描述**：令牌过期前 5 分钟自动触发；401 时也会静默刷新一次并重放原请求

**契约类型：** 请求：无 Body；响应：`RefreshTokenResponse`

**Cookie：**

- 成功刷新后会轮换 refreshToken
- 响应头重新写入新的 HttpOnly Refresh Cookie

### 2.3 登出

- **POST** `/auth/logout`
- **是否鉴权**：否（跳过 401 处理）
- **描述**：服务端清理当前 refresh session，并清空 Refresh Cookie；若请求带有 accessToken，会一并加入黑名单

**契约类型：** 请求：无 Body；响应：`null`

### 2.4 获取当前用户信息

- **GET** `/auth/me`
- **是否鉴权**：是

**契约类型：** 响应：`AuthMeResponse`

### 2.5 修改当前用户密码

- **POST** `/auth/change-password`
- **是否鉴权**：是

**契约类型：** 请求：`ChangePasswordRequest`；响应：`null`

**登录与改密规则：**

- Tenant 端新建用户创建成功后，服务端统一设置初始密码为 `123456`，并要求该用户首次登录修改密码；首次登录响应 `LoginResponse.user.requiresPasswordReset=true`

**业务规则：**

- 新密码长度必须为 8 到 20 位
- 新密码至少包含大写字母、小写字母、数字、特殊字符中的 2 类
- 新密码不能包含空格
- 新密码不能是常见弱口令
- 新密码不能与当前密码相同

---

## 三、订单模块 Orders（17 个）

> 后端自动按当前用户的 tenantId 过滤，仅返回本租户数据。
> 订单创建与正式导入成功时，服务端同步生成 `orders.qrCodeToken`。它的业务语义等同 `h5EntryToken`，供前端在送货单上渲染 `/pay/:token` 二维码并进入 H5 订单详情页。
> 订单导入链路为“默认模板 -> 租户模板 -> 预检 -> 正式导入 -> 导入任务 -> 订单查询”；预检同步执行，正式导入异步执行。

### 契约约定

- 订单域相关闭集统一使用 `OrderStatus`、`OrderPayType`、`OrderImportConflictPolicy`、`OrderImportJobStatus`、`CreditOrderStatus`
- 本章节只保留订单生命周期、导入链路、打印追溯与回款语义，不再长期维护订单结构镜像

### 3.1 获取订单列表

- **GET** `/orders`

**契约类型：** 请求：`OrderListQuery`；响应：`PaginatedResponse<TenantOrderItem>`

**补充说明：**

- 列表项会返回 `mappingTemplateId` 与 `qrCodeToken`
- `qrCodeToken` 的业务语义等同 `h5EntryToken`，前端据此生成 `/pay/:token`
- 列表只返回订单聚合视图，商品明细通过单条详情接口获取

### 3.2 获取单个订单

- **GET** `/orders/{id}`
- **说明**：响应中应显式包含 `qrCodeToken`；其业务语义等同 `h5EntryToken`，用于前端生成送货单二维码并打开对应订单 H5 页面。

**契约类型：** 响应：`TenantOrderItem`

**补充说明：**

- 详情会返回完整 `lineItems`
- 详情响应必须显式返回 `qrCodeToken`
- `customerFieldValues` 为映射模板 `type=list` 的订单级自定义字段值快照；商品明细行级自定义字段由 `lineItems[].customerFieldValues` 承载

### 3.3 创建订单

- **POST** `/orders`
- **说明**：手工建单使用独立写入契约；导入链路与订单读取接口使用导入模板投影后的订单结构。

**契约类型：** 请求：`CreateOrderRequest`；响应：`TenantOrderItem`

### 3.4 更新订单

- **PUT** `/orders/{id}`
- **说明**：手工改单使用独立写入契约；导入链路与订单读取接口使用导入模板投影后的订单结构。

**契约类型：** 请求：`UpdateOrderRequest`；响应：`TenantOrderItem`

### 3.5 更新订单作废状态

- **PATCH** `/orders/{id}`
- **描述**：通过部分更新订单资源的作废字段，安全终结订单生命周期。一旦作废全链路生效不可逆。

**契约类型：** 请求：`VoidOrderRequest`；响应：`TenantOrderItem`

**补充说明：**

- 作废后返回最新订单聚合视图
- `voided`、`voidReason`、`voidedAt` 为本次操作后最终状态

### 3.6 获取系统默认映射模板

- **GET** `/import/default-template`
- **描述**：获取系统默认映射模板。租户创建或编辑自定义模板时，必须先以该默认模板为基底填写 `mapStr`，再补充自定义字段。

**契约类型：** 响应：`OrderImportTemplateField[]`

**字段语义：**

- `isRequired`：为 `true` 的字段，在创建/更新模板时 `mapStr` 必须填写；为 `false` 时 `mapStr` 允许为空字符串
- `isValueRequired`：服务端 `/preview` 校验开关。前端请求时可省略；服务端以本接口返回的系统定义为权威值，自动覆盖前端入参
- `mapStr` 在同一模板内允许重复，不做去重校验
- 固定返回 14 项系统字段，其中 7 项订单头字段与 7 项订单明细字段的 `key / type` 为稳定值；订单明细字段新增 `packSpec`，表示销售单位内含规格，例如 `24桶`

### 3.7 导入-获取模板列表

- **GET** `/import/templates`
- **描述**：获取当前租户可用的订单导入模板。该接口用于导入页面的模板选择与模板内容读取；模板的创建与维护仍仅限 `TENANT_OWNER`。

**契约类型：** 响应：`OrderImportTemplate[]`

**业务规则：**

- `defaultFields` 固定 14 项，字段 key 与 `GET /import/default-template` 保持一致
- 其中 3 项订单头字段（`sourceOrderNo / customer / orderTime`）`isRequired=true`，模板创建/更新时 `mapStr` 必填
- 其余 4 项订单头字段（`customerPhone / customerAddress / totalAmount / payType`）`isRequired=false`，`mapStr` 允许为空
- 除 `customerPhone` 外的 6 项订单头字段均为 `isValueRequired=true`，服务端 `/preview` 会强制这些列有值；`customerPhone.isValueRequired=false`，缺失或空字符串会在正式导入时存为 `NULL`
- 7 项订单明细字段均为 `isRequired=false`、`isValueRequired=false`，mapStr 与导入值都允许为空；其中 `packSpec` 表示销售单位内含规格，可与 `skuSpec / unit` 组合展示为 `1箱 = 153g * 24桶`
- `isRequired` 控制模板 `mapStr` 必填；`isValueRequired` 控制 `/preview` 值必填，服务端以系统定义为权威
- `customerFields` 为租户自定义字段，结构与默认字段一致
- 当前模板列表只返回新结构，不再返回旧三段式 `sourceColumns / fields / mappings`

### 3.8 导入-创建模板

- **POST** `/import/templates`

**契约类型：** 请求：`CreateOrderImportTemplateRequest`；响应：`OrderImportTemplateMutationResponse`

**服务端规则：**

- `defaultFields` 必须完整包含 14 个系统字段，且 `key / label / isRequired / type` 不能改写
- `isValueRequired` 为服务端权威字段：前端可省略，即使传入错值也会被服务端静默覆盖为系统定义值
- `defaultFields[].mapStr` 仅在对应字段 `isRequired=true` 时必填；其余字段允许为空
- `defaultFields + customerFields` 内 `mapStr` 允许重复，不做全局去重
- 创建模板时，租户自定义字段 key 由服务端生成并随响应返回
- `customerFields[].mapStr` 允许为空字符串
- 所有 `customerFields[].isRequired` 均由服务端固定为 `false`
- `customerFields[].isValueRequired` 未传时默认为 `false`；设为 `true` 时 `/preview` 会强制该列必须有值
- `customerFields[].type` 未传时默认为 `list`
- 同租户下模板名称唯一；服务端按去首尾空格后比较，大小写不敏感
- `customerFields[].label` 在同一模板内不允许重复

**错误语义：**

- `400`：请求结构不合法，例如缺失系统字段、必填系统字段 `mapStr` 为空、固定字段被篡改、自定义字段 `label` 重复
- `409`：同租户下模板名称冲突

### 3.9 导入-更新模板

- **PUT** `/import/templates/{id}`

**契约类型：** 请求：`UpdateOrderImportTemplateRequest`；响应：`OrderImportTemplateMutationResponse`

**服务端规则：**

- 更新时仍按整包模板校验，不支持局部跳过系统字段
- `defaultFields` 必须完整包含 14 个系统字段，且 `key / label / isRequired / type` 不能改写
- `isValueRequired` 前端可省略；服务端以系统定义为权威值，传入值会被静默覆盖
- `defaultFields[].mapStr` 仅在 `isRequired=true` 时必填，其余允许为空；`mapStr` 在模板内允许重复
- 同租户下模板名称唯一；更新时排除当前模板自身
- 更新已有租户自定义字段时应保持原 key，新增字段由服务端分配新 key，未提交的旧字段视为删除
- `customerFields[].label` 在同一模板内不允许重复

**错误语义：**

- `400`：请求结构不合法，例如缺失系统字段、必填系统字段 `mapStr` 为空、固定字段被篡改、自定义字段 `label` 重复
- `404`：模板不存在，或模板不属于当前租户
- `409`：同租户下模板名称冲突

- 更新模板时按当前提交内容整体替换模板结构
- 租户自定义字段 key 用于关联历史订单自定义字段值，不应因排序调整重新编号
- 相同租户下若本次更新设置 `isDefault=true`，则其他模板自动取消默认

### 3.10 导入-数据预检校验

- **POST** `/import/preview`
- **描述**：前端完成 Excel 解析并按模板映射回填后，提交标准订单数组做订单级预检。预检同步返回结果，不进入 `import-worker`。

**契约类型：** 请求：`OrderImportPreviewRequest`；响应：`OrderImportPreviewResponse`

**预检规则：**

- 请求体最大 `20 MB`
- `orders` 最多允许 `5000` 条
- 全部订单的 `lineItems` 总数最多允许 `50000` 条
- `orders` 必须为非空数组
- 订单头字段校验由模板的 `isValueRequired` 驱动；默认 6 项订单头字段要求有值：`sourceOrderNo / customer / customerAddress / totalAmount / orderTime / payType`
- `sourceOrderNo` 永远必填（作为订单唯一标识，不受模板配置影响）
- `customerPhone` 为可选字段；前端不传、传 `null` 或传空字符串时，服务端不作为预检错误，正式导入落库为 `NULL`
- `orderTime` 支持 `YYYY-MM-DD` 或 `YYYY-MM-DD HH:mm:ss`；仅传日期时按当天 `00:00:00` 归一化
- `totalAmount` 允许为 `0`，但不允许为负数；`0` 元订单正式导入后视为无需收款，订单状态直接写为 `paid`，`paid=0`
- `orders[].customerFieldValues` 只承载导入模板 `type=list` 的自定义字段值；key 必须命中当前模板的 `customerFields[].key`，且字段类型必须为 `list`
- `orders[].lineItems[].customerFieldValues` 只承载导入模板 `type=line` 的商品行级自定义字段值；key 必须命中当前模板的 `customerFields[].key`，且字段类型必须为 `line`
- 未配置对应层级自定义字段时，对应的 `customerFieldValues` 可省略
- 若 `customerFields[].isValueRequired=true`，`type=list` 字段要求每张订单有值，`type=line` 字段要求每条商品明细有值；预检错误文案应优先使用模板字段 `label`，例如 `商品行自定义字段「商品批次」不能为空`
- `payType` 当前只允许 `cash / credit`
- `lineItems` 至少需要 1 条（代表一个商品），否则预检失败
- 明细字段（skuName/skuSpec/unit/quantity/packSpec/unitPrice/lineAmount）默认均为可选；`quantity * unitPrice = lineAmount` 仅在三者同时提供时校验
- `invalidOrders.length === 0` 时，前端才应继续触发正式导入
- 服务端将预检结果缓存到 Redis，默认保留 15 分钟；超时未发起正式导入时，前端需要重新调用 `/import/preview`
- 同一用户若已有预检请求正在执行，服务端应直接提示“预检进行中”，避免重复提交同一批数据
- 租户内即使已有 `pending / processing` 的正式导入任务，仍允许继续调用 `/import/preview` 生成新的预检结果；是否能正式提交由 `/orders/import` 在提交时单独判断
- 预检快照需绑定生成时的租户导入版本 `importRevision`

### 3.11 异步正式导入

- **POST** `/orders/import`
- **描述**：消费预检成功的 `previewId`，创建正式导入任务。该接口本身不再接收原始订单数组。

**契约类型：** 请求：`OrderImportSubmitRequest`；响应：`OrderImportSubmitResponse`

**业务规则：**

- `/orders/import` 只能消费 `previewId`，不再支持直传 `orders / rows / templateId`
- 一个 `previewId` 成功创建导入任务后立即视为已消费，不允许重复提交
- 正式导入才进入 `import-worker`；预检始终同步执行
- 同一租户若已有 `pending / processing` 导入任务，服务端应拒绝再次发起，并返回当前任务状态与 `jobId`
- 上述限制仅作用于正式导入提交；租户内已有活动导入任务时，前端仍可继续发起新的 `/import/preview`
- Redis 中的预检快照在 `/orders/import` 成功创建 `jobId` 后立即删除；任务恢复与轮询以 `import_jobs.snapshot` 为准
- `/orders/import` 成功创建 `jobId` 后，服务端应原子推进当前租户 `importRevision += 1`
- 若当前 `previewId` 绑定的 `importRevision` 已落后于租户最新值，则该预检结果整体失效，服务端应拒绝本次提交并要求重新预检

### 3.12 轮询导入进度

- **GET** `/orders/import/jobs/{jobId}`
- **描述**：用于轮询长耗时任务的执行成功率与返回报告

**契约类型：** 响应：`OrderImportJobResponse`

### 3.13 提交打印成功回执

- **POST** `/orders/print-records`
- **描述**：前端在本机实际打印成功后，提交单张订单的打印成功回执；服务端据此累计该订单的 `orders.prints`、刷新 `orders.lastPrintedAt`，并写入一条打印成功事件（`order_print_records`，`result=success`）用于打印追溯。

**契约类型：** 请求：`OrderPrintRecordRequest`；响应：`OrderPrintRecordResponse`

**业务规则：**

- 该接口是打印成功回执接口，不承担实际打印动作
- 推荐使用 `orderId` 提交单张实际打印成功的订单
- `orderIds` 仅为兼容旧前端保留，若传入则长度必须等于 `1`
- `orderId` 与 `orderIds` 至少传一个；若两者同时传入，二者必须指向同一张订单
- 前端批量打印应由前端循环调用本接口完成，服务端每次只确认一张订单的打印结果
- 服务端应按当前租户作用域校验订单归属
- `totalCount` 与 `successCount` 在成功场景下均为 `1`
- 服务端事务内写入一条 `order_print_records(result=success)`，自动附带 `operatorId / operatorName / printedAt / requestId`
- 写事件的同时：`orders.prints += 1`，`orders.lastPrintedAt = printedAt`；不触碰失败类计数器
- 同一租户下，相同 `requestId` 的重复提交必须幂等返回首次结果，且不得产生重复事件与重复自增

### 3.14 上报打印失败记录

- **POST** `/orders/{id}/print-failures`
- **描述**：前端在本机实际打印失败后，按订单单条上报失败原因；仅用于失败事件追溯，不影响订单的 `prints` 成功计数。

**契约类型：** 请求：`CreateOrderPrintFailureRequest`；响应：`CreateOrderPrintFailureResponse`

**路径参数：** `id` 为当前租户可访问的订单 ID。

**业务规则：**

- 该接口不承担实际打印动作，仅记录一次"尝试打印失败"的事件
- `reason` 必填，最长 500 字；客户端应将用户自填或驱动错误码整理后提交
- 服务端校验订单归属当前租户；订单不存在或跨租户访问返回 404
- 服务端写入一条 `order_print_records(result=failed)`，自动附带 `operatorId / operatorName / printedAt / failureReason`
- **不触碰** `orders.prints`、`orders.lastPrintedAt`
- 同步更新 `orders.printFailedCount += 1`，`orders.lastFailedAt = printedAt`
- 服务端同步写一条审计日志，`action = "打印失败记录"`
- 同一租户下，相同 `requestId` 的重复提交必须幂等返回首次结果，且不得产生重复事件与重复自增

### 3.15 获取单订单打印历史

- **GET** `/orders/{id}/print-records`
- **描述**：返回指定订单的全部打印事件（成功 + 失败）时间线，用于订单详情页"打印历史" Tab 展示。

**契约类型：** 请求：`OrderPrintRecordsQuery`；响应：`OrderPrintRecordsResponse`

**路径参数：** `id` 为当前租户可访问的订单 ID。

**业务规则：**

- 该接口仅读取，不修改任何事件与订单数据
- 服务端校验订单归属当前租户；跨租户访问返回 404
- 列表默认按 `printedAt DESC` 排序
- `summary` 是为详情页卡片准备的聚合视图，与分页参数无关；页面切换分页不需要重算
- 事件是不可变历史快照，不提供任何修改或删除接口

### 3.16 跨订单打印事件追溯

- **GET** `/orders/print-records`
- **描述**：管理与对账视角下的跨订单打印事件追溯，用于定位异常打印、统计操作人工作量等场景。打单员（TENANT_OPERATOR）无权访问，应改用 `GET /orders/{id}/print-records`。

**契约类型：** 请求：`TenantPrintRecordsQuery`；响应：`TenantPrintRecordsResponse`

**业务规则：**

- 服务端自动按当前租户过滤，跨租户数据不可见
- 列表默认按 `printedAt DESC` 排序
- `summary` 针对当前过滤条件计算，与分页参数无关
- 该接口为只读追溯视图，不提供修改或删除能力

### 3.17 创建催款提醒记录

- **POST** `/orders/{id}/reminders`
- **描述**：在指定订单下创建一条催款提醒记录，并触发对应通知渠道

**契约类型：** 请求：`CreateOrderReminderRequest`；响应：`CreateOrderReminderResponse`

---

## 四、支付与核销 Payment（3 个）

> 此模块是 Tenant 与 H5 的核心关联点。客户在 H5 支付后，Tenant 端查看流水并核销。

### 契约约定

- 支付页与租户侧收款链路统一使用 `PaymentOrderStatus` 与 `PaymentRecordStatus` 两组闭集。
- 本章节保留支付状态语义、核销协作与展示约束，不再长期维护结构镜像版 `PaymentRecord`。

### 4.1 获取收款流水列表

- **GET** `/payments`

**契约类型：** 请求：`PaymentListQuery`；响应：`PaginatedResponse<TenantPaymentRecordItem>`

### 4.2 获取收款汇总统计

- **GET** `/payments/summary`

**契约类型：** 响应：`PaymentSummaryResponse`

### 4.3 创建线下登记确认记录

- **POST** `/orders/{id}/cash-verifications`
- **描述**：在指定订单下确认一条线下登记记录；`payment_orders.status` 从 `pending_verification` 变为 `paid`

**契约类型：** 请求：无 Body；响应：`CreateCashVerificationResponse`

**业务规则：**

- 仅 `pending_verification` 状态的线下登记支付单可以确认
- 核销后，H5 端再次打开该订单页面将看到"订单已完成"
- 同时在 `payments` 表生成一条 `channel=cash` 或 `channel=other_paid` 的收款记录
- 同步更新 `orders.paid` 与 `orders.status`

**数据流：**

```
H5 客户选择线下登记 → payment_orders.status = pending_verification
                                    ↓
Tenant 财务 POST /orders/{id}/cash-verifications
                                    ↓
              payment_orders.status = paid + payments 新增一条记录 + orders 收款状态更新
                                    ↓
              H5 客户再次打开页面 → 看到"订单已完成"
```

---

## 五、财务对账 Finance（3 个）

> 提供本租户维度的财务汇总和对账明细。

### 契约约定

- 对账状态统一使用闭集 `FinanceReconciliationStatus`

### 5.1 获取财务汇总

- **GET** `/finance/summary`

**契约类型：** 响应：`FinanceSummaryResponse`

### 5.2 获取对账明细

- **GET** `/finance/reconciliation`

**契约类型：** 请求：`FinanceReconciliationQuery`；响应：`PaginatedResponse<FinanceReconciliationRecordItem>`

### 5.3 导出对账单

- **GET** `/finance/reconciliation/export`
- **Content-Type**：`application/octet-stream`

**响应**：Excel 文件流

---

## 六、账期管理与内部收款 Credit（2 个）

> 管理 payType=账期 的订单，并提供租户财务后台内部收款能力。

### 6.1 获取账期订单列表

- **GET** `/orders/credit`

**契约类型：** 请求：`CreditOrderListQuery`；响应：`PaginatedResponse<CreditOrderItem>`

**状态说明：**

| creditStatus | 中文     | 颜色 | 规则                  |
| ------------ | -------- | ---- | --------------------- |
| `overdue`    | 逾期     | 红   | 超过 dueDate          |
| `today`      | 今日到期 | 橙   | dueDate = 今天        |
| `soon`       | 即将到期 | 蓝   | dueDate 在未来 7 天内 |
| `normal`     | 正常     | 灰   | dueDate 在 7 天之后   |

### 6.2 创建内部收款记录

- **POST** `/orders/{id}/receipts`
- **描述**：仅租户财务后台使用。为订单创建一条内部确认的收款记录，并同步累计订单已收金额与订单状态

**契约类型：** 请求：`CreateOrderReceiptRequest`；响应：`CreateOrderReceiptResponse`

**业务规则：**

- 可用于账期订单回款，也可用于现款订单的内部手工补录收款
- `amount` 未传时，服务端按订单当前剩余应收金额全额入账
- `amount` 传入时，必须大于 `0.01` 且不超过订单当前剩余应收金额
- 若订单存在仍处于 `paying` 的在线支付单，拒绝创建内部收款记录
- 若订单存在仍处于 `pending_verification` 的现金待核销单，拒绝创建内部收款记录
- 该接口只对租户后台财务开放，不改变 H5/public 对外支付仍为服务端定额收款的约束

---

---

## 七、数据分析 Analytics（4 个）

> 全部数据自动按当前租户过滤。

### 7.1 获取日趋势

- **GET** `/analytics/daily-trend`
- **描述**：近 7 天的日维度应收/实收趋势

**契约类型：** 响应：`DailyTrendItem[]`

### 7.2 获取月趋势

- **GET** `/analytics/monthly-trend`
- **描述**：近 N 个月的月维度应收/实收趋势

**契约类型：** 响应：`MonthlyTrendItem[]`

### 7.3 获取实时收款动态

- **GET** `/analytics/payments/live`
- **描述**：今日实时收款流水列表

**契约类型：** 响应：`LiveFeedEntryItem[]`

### 7.4 获取仪表盘聚合数据

- **GET** `/analytics/dashboard`
- **描述**：首页仪表盘所需的聚合数据，一次请求返回，减少多接口拼装

**契约类型：** 响应：`AnalyticsDashboardResponse`

**补充说明：**

- `roleTitle` 由服务端按当前主角色动态生成
- 聚合接口用于首页一次性取数，避免前端拼装多个统计请求

---

## 八、系统设置 Settings（18 个）

> 默认仅 `TENANT_OWNER` 可写；少数只读接口按条目单独声明可见角色。

### 契约约定

- 用户状态统一使用闭集 `UserSimpleStatus`

### 8.1 获取角色列表

- **GET** `/settings/roles`
- **描述**：一期使用固化角色，本接口仅提供供UI展示的基础配置字典。

**契约类型：** 响应：`TenantRoleAccount[]`

### 8.2 获取权限树

- **GET** `/settings/permissions`
- **描述**：返回完整硬编码的权限树结构，仅供展示使用，一期无动态分配权。

**契约类型：** 响应：`PermissionNode[]`

**权限树结构示例：**

```
- 首页（查看收款总览、实时收款动态）
- 订单管理（查看订单列表、导入订单、打印订单）
- 打印设置（查看打印配置、维护映射模板对应的打印模板）
- 财务报表（查看收款报表、对账明细、账期管理、导出报表）
- 系统设置（基础设置、打印配置、角色管理、用户管理）
```

### 8.3 获取用户列表

- **GET** `/settings/users`

**契约类型：** 响应：`TenantSettingsUser[]`

### 8.4 创建用户

- **POST** `/settings/users`

**契约类型：** 请求：`CreateTenantUserRequest`；响应：`TenantSettingsUser`

**校验规则：**

- `phone` 在本租户内唯一（作为登录账号）
- 新建用户初始状态为 `active`
- Tenant 端新建用户不由前端录入合规密码；服务端统一设置初始密码为 `123456`
- 新建用户必须标记为首次登录需修改密码；首次登录响应 `LoginResponse.user.requiresPasswordReset=true`

### 8.5 更新用户

- **PUT** `/settings/users/{id}`

**契约类型：** 请求：`UpdateTenantUserRequest`；响应：`TenantSettingsUser`

**校验规则：**

- 不得移除当前租户最后一个老板账号
- 不得禁用当前租户最后一个可用老板账号

### 8.6 删除用户

- **DELETE** `/settings/users/{id}`

**契约类型：** 响应：`null`

**校验规则：**

- TENANT_OWNER 角色用户不可删除自己
- 不得删除当前租户最后一个老板账号
- 不得删除当前租户最后一个可用老板账号
- 实际为软删除

### 8.7 更新用户状态

- **PATCH** `/settings/users/{id}`
- **描述**：切换用户的启用/禁用状态

**契约类型：** 请求：`TenantUserStatusUpdateRequest`；响应：`TenantSettingsUser`

**校验规则：**

- 不得禁用当前租户最后一个可用老板账号

### 8.8 获取通用配置

- **GET** `/settings/general`
- **描述**：获取当前租户通用通知与业务偏好设置的最终生效值
- **说明**：服务端返回“平台默认值 + 租户覆盖值”的合并结果；`system_configs` 负责平台默认层，`tenant_general_settings` 负责租户覆盖层。
- **补充说明**：`TenantGeneralSettings.qrCodeExpiry` 表示订单可支付有效期，单位为天。
- **主体字段边界**：本接口不再返回或保存租户主体信息；租户名称、联系电话、地址、营业执照号等主体资料统一由租户主体资料接口承载。

**契约类型：** 响应：`TenantGeneralSettings`

### 8.9 保存通用配置

- **PUT** `/settings/general`
- **说明**：仅更新当前租户的通知与业务偏好覆盖层，不直接修改平台默认配置，也不修改企业主体字段。
- **补充说明**：`UpdateTenantGeneralSettingsRequest.qrCodeExpiry` 表示订单可支付有效期，传入和保存的都是天数。

**契约类型：** 请求：`UpdateTenantGeneralSettingsRequest`；响应：`TenantGeneralSettings`

### 8.10 获取当前租户主体资料

- **GET** `/tenant/profile`
- **描述**：获取当前登录态所属租户的主体资料；该接口只读，不承载当前用户资料语义。
- **说明**：租户主体资料包括租户名称、软件版本级别、租户版本描述、租户状态、服务到期时间 `serviceExpireAt` 等，不返回平台侧派生字段 `dueInDays`。

**契约类型：** 响应：`TenantProfile`

### 8.11 获取打印配置列表

- **GET** `/settings/printing`
- **描述**：返回当前租户下所有导入映射模板对应的打印配置摘要视图。若某张映射模板尚未配置，则 `hasCustomConfig=false`，前端回退本地默认模板。

**契约类型：** 响应：`GetPrintingConfigListResponse`

**关键说明：**

- 服务端只返回打印配置外围元信息，不解析 `config` 内部模板结构
- 列表页用于告诉前端“哪些映射模板已有自定义配置，哪些仍使用默认模板”
- 服务端持久化维度为 `tenantId + importTemplateId`

### 8.12 获取单张映射模板的打印配置

- **GET** `/settings/printing/{importTemplateId}`
- **描述**：获取指定导入映射模板对应的完整打印配置。若未配置，则返回 `hasCustomConfig=false`，前端自行回退本地默认模板。

**契约类型：** 响应：`GetPrintingConfigDetailResponse`

**路径参数：** `importTemplateId` 为当前租户下的导入映射模板 ID。

**关键说明：**

- `config` 为前端维护的完整打印配置快照
- 服务端只负责按租户和 `importTemplateId` 维度持久化与回传
- 服务端持久化维度为 `tenantId + importTemplateId`

### 8.13 保存单张映射模板的打印配置

- **PUT** `/settings/printing/{importTemplateId}`
- **描述**：按 `importTemplateId` 保存单张映射模板的打印配置；若此前未配置，则本次保存即创建该模板的覆盖配置。

**契约类型：** 请求：`UpdatePrintingConfigRequest`；响应：`UpdatePrintingConfigResponse`

**路径参数：** `importTemplateId` 为当前租户下的导入映射模板 ID。

**关键说明：**

- 服务端按 `tenantId + importTemplateId` 维度保存黑盒打印配置
- 若该映射模板此前没有自定义配置，则本次保存后 `hasCustomConfig=true`
- 保存接口仅返回最小结果摘要；若前端需要最新完整配置，请重新调用 `GET /settings/printing/{importTemplateId}`
- 不支持删除打印配置；未配置时由前端回退默认模板
- 服务端不承担模板字段级语义校验，也不负责实际打印动作

### 8.14 获取操作日志

- **GET** `/settings/audit-logs`
- **描述**：查看本租户操作日志（tenantId 自动隔离）

**契约类型：** 请求：`TenantAuditLogQuery`；响应：`TenantAuditLogListResponse`

### 8.15 获取支付渠道配置列表

- **GET** `/settings/payment-configs`
- **描述**：获取当前租户的支付渠道配置摘要列表，以及当前生效支付渠道。
- **权限**：`TENANT_OWNER`、`TENANT_FINANCE`

**契约类型：** 响应：`GetTenantPaymentConfigListResponse`

**补充说明：**

- `activePaymentChannel` 表示当前付款链路实际使用的渠道，允许为 `null`
- 列表项只返回渠道摘要，不返回整份渠道专属配置
- 支付渠道闭集当前包含 `lakala`、`shouqianba`、`pingan_bank`
- `shouqianba`、`pingan_bank` 已可作为配置资源查询；真实线上收款网关接入前不能切换为生效渠道

### 8.16 获取单渠道支付配置详情

- **GET** `/settings/payment-configs/{channel}`
- **描述**：获取当前租户指定支付渠道的配置详情；若该渠道尚未配置，返回 `status=not_configured`，不返回 404。
- **权限**：`TENANT_OWNER`、`TENANT_FINANCE`

**契约类型：** 响应：`TenantPaymentConfigSnapshot`

**补充说明：**

- 返回值仅包含事实字段，不返回按钮展示策略字段
- `channel` 为正式资源维度，不再把 `lakala` 写死为接口名
- `config` 内仅返回该渠道的专属字段；`lakala` 使用 `merchantNo`、`terminalNo`
- `shouqianba`、`pingan_bank` 未配置时返回 `status=not_configured`，不因渠道名本身报错

### 8.17 保存单渠道支付配置

- **PUT** `/settings/payment-configs/{channel}`
- **描述**：保存当前租户指定支付渠道的配置；已接入网关的渠道按本地字段完整性校验，未接入网关的渠道可保存黑盒配置但保持 `invalid`
- **权限**：`TENANT_OWNER`

**契约类型：** 请求：`UpsertTenantPaymentConfigRequest`；响应：`TenantPaymentConfigSnapshot`

**补充说明：**

- 若路径已使用 `{channel}`，请求体不再重复传 `channel`
- `config` 仅承载该渠道的专属配置结构
- `lakala.config` 中，`merchantNo` 必填，`terminalNo` 可选
- `shouqianba`、`pingan_bank` 当前未接入，保存后返回 `invalid`，并写入 `invalidReason=渠道尚未接入，暂时不支持该支付渠道配置。`
- 若本次保存与当前值完全一致，可按幂等成功处理
- `available` 不代表拉卡拉已完成资质验证；拉卡拉官方未提供独立配置校验接口，真实商户资质问题只能在首次支付建单时暴露
- H5 聚合收银台首次建单若明确返回商户号、商户资质或商户权限类错误，后端会将该渠道配置降级为 `invalid` 并写入 `invalidReason`
- 当前 H5 聚合收银台不下发 `terminalNo`，因此终端号相关错误不作为 H5 渠道配置无效依据

### 8.18 停用单渠道支付配置

- **POST** `/settings/payment-configs/{channel}/disable`
- **描述**：停用当前租户指定渠道的线上收款配置，不清空该渠道已有配置内容
- **权限**：`TENANT_OWNER`

**契约类型：** 响应：`TenantPaymentConfigSnapshot`

### 8.19 切换当前生效支付渠道

- **POST** `/settings/payment-configs/{channel}/activate`
- **描述**：将指定渠道切换为当前租户的生效支付渠道；后端先校验该渠道配置必须处于 `available`，且该渠道已有线上支付网关实现
- **权限**：`TENANT_OWNER`

**契约类型：** 响应：`TenantPaymentConfigSnapshot`

**补充说明：**

- `activate` 只表示“切换当前生效支付渠道”，不等于修改渠道配置状态
- 同一时刻只能有一个 `activePaymentChannel`
- 当前仅 `lakala` 允许激活为线上收款渠道；`shouqianba`、`pingan_bank` 在网关实现接入前会返回业务错误

---

## 九、通知 Notifications（2 个）

> Tenant 是公告的**接收方**，Admin 是发布方。

### 9.1 获取平台公告列表

- **GET** `/notifications`
- **描述**：获取平台发布的、当前租户可见的公告列表

**契约类型：** 请求：`TenantNotificationListQuery`；响应：`PaginatedResponse<TenantNotificationRecordItem>`

### 9.2 标记公告已读

- **POST** `/notifications/{id}/read-records`

**契约类型：** 请求：无 Body；响应：`null`

---

## 十、资质提交 Certification（2 个）

> Tenant 提交资质材料，Admin 在 `/tenants/certifications/{id}/review-decisions` 创建审核决议。

### 契约约定

- 资质状态统一使用闭集 `TenantCertificationStatus`

### 10.1 提交资质材料

- **POST** `/tenants/certification`
- **描述**：提交当前租户的资质认证材料

**契约类型：** 请求：`TenantCertificationSubmitRequest`；响应：`TenantCertificationSubmitResponse`

### 10.2 查询资质状态

- **GET** `/tenants/certification`
- **描述**：查询当前租户的资质认证状态

**契约类型：** 响应：`TenantCertificationStatusResult`

---

## 十一、跨项目关联

### 与 H5 端的关联

| Tenant 操作                                     | 关联的 H5 端行为                                                                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 创建订单 / 导入订单 → 生成订单二维码            | H5 通过 `orders.qrCodeToken`（业务语义等同 `h5EntryToken`）打开对应订单页面，是否展示支付按钮由订单状态决定                                    |
| 保存支付渠道配置并切换生效渠道                  | H5 `paymentAction.canInitiate` 仅在租户已设置 `activePaymentChannel`、当前生效渠道配置状态为 `available`，且订单本身可支付时才允许发起线上支付 |
| 财务确认 `POST /orders/{id}/cash-verifications` | H5 端线下登记订单状态从 `pending_verification` → `paid`                                                                                        |
| 收款流水 `GET /payments`                        | 包含 H5 在线支付成功后生成的记录                                                                                                               |

### 与 Admin 端的关联

| Tenant 数据           | Admin 端可见性                                                              |
| --------------------- | --------------------------------------------------------------------------- |
| 本租户订单            | Admin `GET /orders` 跨租户汇总中可见                                        |
| 本租户收款            | Admin `GET /payments` 跨租户流水中可见                                      |
| 本租户服务商          | Admin `GET /service-providers` 监管视角中可见                               |
| 本租户用户            | Admin `GET /users` 跨租户用户列表中可见                                     |
| 本租户支付渠道配置    | Admin `GET /tenants/payment-configs` 可见并可兜底校验 / 停用 / 切换生效渠道 |
| 接收 Admin 发布的公告 | Admin `POST /notices` 创建的公告推送到 Tenant                               |
