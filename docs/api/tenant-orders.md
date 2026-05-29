# Tenant 订单

> 本文件承接 Tenant 订单核心功能的业务语义，包括订单读写、作废、打印回执、打印追溯、催款、账期订单与内部收款
> 若本文件的领域细节与 [tenant-api-doc.md](./tenant-api-doc.md) 的全局边界冲突，以全局边界为准

## 一、订单读写、打印与催款

> 后端自动按当前用户的 tenantId 过滤，仅返回本租户数据。
> 订单创建与正式导入成功时，服务端同步生成 `orders.qrCodeToken`。它的业务语义等同 `h5EntryToken`，供前端在送货单上渲染 `/pay/:token` 二维码并进入 H5 订单详情页。
> 订单导入链路由 [tenant-import-flow.md](./tenant-import-flow.md) 承接；本文件只保留订单读写、打印追溯与催款。

### 契约约定

- 订单域相关闭集统一使用 `OrderStatus`、`OrderPayType`、`CreditType`、`OrderImportConflictPolicy`、`OrderImportJobStatus`、`CreditOrderStatus`
- `payType` 表示一级结算方式：`cash` 为现款，`credit` 为账期
- `creditType` 表示 `payType=credit` 时的账期子类型：`month` 为月结，`week` 为周结，`period` 为普通账期
- `payType=cash` 时 `creditType / creditDays / dueDate` 均应为 `null`；`payType=credit` 时 `creditType` 原则上必须为 `month | week | period`
- 滚结本期按现款处理：导入识别为 `payType=cash, creditType=null`，不进入账期管理、账期待办和 `payType=credit` 统计
- `creditStatus` 只作为查询时动态计算的展示字段，不落库
- 本章节只保留订单生命周期、订单读写、打印追溯与催款语义，不再长期维护订单结构镜像

### 1.1 获取订单列表

- **GET** `/orders`
- **权限**：`orders.read`

**契约类型：** 请求：`OrderListQuery`；响应：`PaginatedResponse<TenantOrderItem>`

**补充说明：**

- `OrderListQuery.creditType` 支持按 `month / week / period` 筛选账期子类型；有值时仅适用于 `payType=credit`
- `payType=cash&creditType=month|week|period` 属于非法筛选组合，服务端应返回 400
- 列表项会返回 `mappingTemplateId` 与 `qrCodeToken`
- `qrCodeToken` 的业务语义等同 `h5EntryToken`，前端据此生成 `/pay/:token`
- 列表只返回订单聚合视图，商品明细通过单条详情接口获取
- 列表项返回 `creditType / creditDays / dueDate`；现款订单三者均为 `null`

### 1.2 获取单个订单

- **GET** `/orders/{id}`
- **权限**：`orders.read`

**契约类型：** 响应：`TenantOrderItem`

**补充说明：**

- 详情会返回完整 `lineItems`
- 详情响应必须显式返回 `qrCodeToken`
- 详情响应返回 `creditType / creditDays / dueDate`；现款订单三者均为 `null`
- `customerFieldValues` 为映射模板 `type=list` 的订单级自定义字段值快照；商品明细行级自定义字段由 `lineItems[].customerFieldValues` 承载

### 1.3 创建订单

- **POST** `/orders`
- **权限**：`orders.manage`

**契约类型：** 请求：`CreateOrderRequest`；响应：`TenantOrderItem`

**业务规则：**

- 手工建单使用独立写入契约
- 导入链路与订单读取接口使用导入模板投影后的订单结构

### 1.4 更新订单

- **PUT** `/orders/{id}`
- **权限**：`orders.manage`

**契约类型：** 请求：`UpdateOrderRequest`；响应：`TenantOrderItem`

**业务规则：**

- 手工改单使用独立写入契约
- 导入链路与订单读取接口使用导入模板投影后的订单结构

### 1.5 更新订单作废状态

- **PATCH** `/orders/{id}`
- **权限**：`orders.void`

**契约类型：** 请求：`VoidOrderRequest`；响应：`TenantOrderItem`

**业务规则：**

- 通过部分更新订单资源的作废字段，安全终结订单生命周期
- 一旦作废全链路生效不可逆
- 作废后返回最新订单聚合视图
- `voided`、`voidReason`、`voidedAt` 为本次操作后最终状态

### 1.6 提交打印成功回执

- **POST** `/orders/print-records`
- **权限**：`orders.print.manage`

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

### 1.7 上报打印失败记录

- **POST** `/orders/{id}/print-failures`
- **权限**：`orders.print.manage`

**契约类型：** 请求：`CreateOrderPrintFailureRequest`；响应：`CreateOrderPrintFailureResponse`

**业务规则：**

- 该接口不承担实际打印动作，仅记录一次"尝试打印失败"的事件
- `reason` 必填，最长 500 字；客户端应将用户自填或驱动错误码整理后提交
- 服务端校验订单归属当前租户；订单不存在或跨租户访问返回 404
- 服务端写入一条 `order_print_records(result=failed)`，自动附带 `operatorId / operatorName / printedAt / failureReason`
- **不触碰** `orders.prints`、`orders.lastPrintedAt`
- 同步更新 `orders.printFailedCount += 1`，`orders.lastFailedAt = printedAt`
- 服务端同步写一条审计日志，`action = "打印失败记录"`
- 同一租户下，相同 `requestId` 的重复提交必须幂等返回首次结果，且不得产生重复事件与重复自增

### 1.8 获取单订单打印历史

- **GET** `/orders/{id}/print-records`
- **权限**：`orders.print.manage`

**契约类型：** 请求：`OrderPrintRecordsQuery`；响应：`OrderPrintRecordsResponse`

**业务规则：**

- 该接口仅读取，不修改任何事件与订单数据
- 服务端校验订单归属当前租户；跨租户访问返回 404
- 列表默认按 `printedAt DESC` 排序
- `summary` 是为详情页卡片准备的聚合视图，与分页参数无关；页面切换分页不需要重算
- 事件是不可变历史快照，不提供任何修改或删除接口

### 1.9 跨订单打印事件追溯

- **GET** `/orders/print-records`
- **权限**：`orders.print.manage`

**契约类型：** 请求：`TenantPrintRecordsQuery`；响应：`TenantPrintRecordsResponse`

**业务规则：**

- 服务端自动按当前租户过滤，跨租户数据不可见
- 列表默认按 `printedAt DESC` 排序
- `summary` 针对当前过滤条件计算，与分页参数无关
- 该接口为只读追溯视图，不提供修改或删除能力

### 1.10 创建催款提醒记录

- **POST** `/orders/{id}/reminders`
- **权限**：`orders.reminder.create`

**契约类型：** 请求：`CreateOrderReminderRequest`；响应：`CreateOrderReminderResponse`

## 二、账期管理与内部收款

> 管理 `payType=credit` 的订单，并提供租户财务后台内部收款能力。滚结本期按现款处理，不出现在账期列表中。

### 2.1 获取账期订单列表

- **GET** `/orders/credit`
- **权限**：`credit.read`

**契约类型：** 请求：`CreditOrderListQuery`；响应：`PaginatedResponse<CreditOrderItem>`

**补充说明：**

- 列表只返回 `payType=credit` 的订单
- `CreditOrderItem.payType` 固定为 `credit`，并返回 `creditType` 表示月结、周结或普通账期
- `CreditOrderItem.creditDays / dueDate` 来源于订单持久化字段；历史异常数据可由服务端按普通账期兜底展示
- `creditStatus` 由 `dueDate`、当前日期和租户 `creditRemindDays` 动态计算，不作为数据库字段持久化

**状态说明：**

| creditStatus | 中文     | 颜色 | 规则                       |
| ------------ | -------- | ---- | -------------------------- |
| `overdue`    | 逾期     | 红   | 超过 dueDate               |
| `today`      | 今日到期 | 橙   | dueDate = 今天             |
| `soon`       | 即将到期 | 蓝   | dueDate 在提醒天数范围内   |
| `normal`     | 正常     | 灰   | dueDate 在提醒天数范围之后 |

### 2.2 创建内部收款记录

- **POST** `/orders/{id}/receipts`
- **权限**：`credit.receipt.create`

**契约类型：** 请求：`CreateOrderReceiptRequest`；响应：`CreateOrderReceiptResponse`

**业务规则：**

- 仅租户财务后台使用，为订单创建一条内部确认的收款记录，并同步累计订单已收金额与订单状态
- 可用于账期订单回款，也可用于现款订单的内部手工补录收款
- `amount` 未传时，服务端按订单当前剩余应收金额全额入账
- `amount` 传入时，必须大于 `0.01` 且不超过订单当前剩余应收金额
- 若订单存在仍处于 `paying` 的在线支付单，拒绝创建内部收款记录
- 若订单存在仍处于 `pending_verification` 的现金待核销单，拒绝创建内部收款记录
- 该接口只对租户后台财务开放，不改变 H5/public 对外支付仍为服务端定额收款的约束

---
