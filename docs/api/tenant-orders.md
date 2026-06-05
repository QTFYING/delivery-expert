# Tenant 订单

> 本文件承接 Tenant 订单核心功能的业务语义，包括订单读写、作废、打印回执、打印追溯、催款、账期订单与内部收款
> 若本文件的领域细节与 [tenant-api-doc.md](./tenant-api-doc.md) 的全局边界冲突，以全局边界为准

## 一、订单读写、打印与催款

> 后端自动按当前用户的 tenantId 过滤，仅返回本租户数据。
> 订单创建与正式导入成功时，服务端同步生成 `orders.qrCodeToken`。它的业务语义等同 `h5EntryToken`，供前端在送货单上渲染 `/pay/:token` 二维码并进入 H5 订单详情页。
> 订单导入链路由 [tenant-import-flow.md](./tenant-import-flow.md) 承接；本文件只保留订单读写、打印追溯与催款。

### 1.1 获取订单列表

- **GET** `/orders`

**补充说明：**

- 账期筛选使用 `payType=credit`，不要使用已废弃的 `status=credit`
- 本期状态搜索只开放 `pending / paid / expired`；`partial / voided` 保留为订单状态但不作为搜索条件
- `status=expired` 为动态筛选：现款订单按租户 `qrCodeExpiry` 支付有效期判断，账期订单按账期到期日判断
- `payType=cash&creditType=month|week|period` 属于非法筛选组合，服务端应返回 400
- `OrderListQuery.mappingTemplateId` 按订单上的导入映射模板 ID 筛选；导入预检请求中的 `templateId` 仍表示本次导入选择的模板

### 1.2 获取单个订单

- **GET** `/orders/{id}`

**补充说明：**

- `customerFieldValues` 为映射模板 `type=list` 的订单级自定义字段值快照；商品明细行级自定义字段由 `lineItems[].customerFieldValues` 承载
- 详情响应返回 `offlinePayment`，语义与列表一致；该字段只用于展示 H5 线下登记信息，财务针对该类订单确认入账需调用 `POST /orders/{id}/offline-payment-verifications`

### 1.3 创建订单

- **POST** `/orders`

**业务规则：**

- 手工建单使用独立写入契约
- 导入链路与订单读取接口使用导入模板投影后的订单结构
- 若手工改单维护订单级自定义字段，请求字段统一使用 `customerFieldValues`

### 1.4 更新订单

- **PUT** `/orders/{id}`

**业务规则：**

- 手工改单使用独立写入契约
- 导入链路与订单读取接口使用导入模板投影后的订单结构

### 1.5 更新订单作废状态

- **PATCH** `/orders/{id}`

**业务规则：**

- 一旦作废全链路生效不可逆
- 作废后订单状态为 `voided`，不再与 `expired` 混用
- 已作废订单不参与本期开放的状态搜索

### 1.6 提交打印成功回执

- **POST** `/orders/print-records`

**业务规则：**

- 该接口是打印成功回执接口，不承担实际打印动作
- 成功回执会累计订单打印次数并更新最近打印时间；不影响失败类计数
- 同一租户下，相同 `requestId` 的重复提交必须幂等返回首次结果，且不得产生重复事件与重复自增

### 1.7 上报打印失败记录

- **POST** `/orders/{id}/print-failures`

**业务规则：**

- 该接口不承担实际打印动作，仅记录一次"尝试打印失败"的事件
- **不触碰** `orders.prints`、`orders.lastPrintedAt`
- 同步更新 `orders.printFailedCount += 1`，`orders.lastFailedAt = printedAt`
- 同一租户下，相同 `requestId` 的重复提交必须幂等返回首次结果，且不得产生重复事件与重复自增

### 1.8 获取单订单打印历史

- **GET** `/orders/{id}/print-records`

**业务规则：**

- 该接口仅读取，不修改任何事件与订单数据
- `summary` 是为详情页卡片准备的聚合视图，与分页参数无关；页面切换分页不需要重算
- 事件是不可变历史快照，不提供任何修改或删除接口

### 1.9 跨订单打印事件追溯

- **GET** `/orders/print-records`

**业务规则：**

- `summary` 针对当前过滤条件计算，与分页参数无关
- 该接口为只读追溯视图，不提供修改或删除能力

### 1.10 创建催款提醒记录

- **POST** `/orders/{id}/reminders`

## 二、账期管理与内部收款

> 管理 `payType=credit` 的订单，并提供租户财务后台内部收款能力。滚结本期按现款处理，不出现在账期列表中。

### 2.1 获取账期订单列表

- **GET** `/orders/credit`

**补充说明：**

- 列表只返回未删除、未作废且 `payType=credit` 的订单
- 账期列表中的 `status=expired` 来自账期到期日动态判断，语义为账期已过期
- `creditStatus` 由 `dueDate`、当前日期和租户 `creditRemindDays` 动态计算，不作为数据库字段持久化

**状态说明：**

| creditStatus | 中文     | 规则                       |
| ------------ | -------- | -------------------------- |
| `overdue`    | 逾期     | 超过 dueDate               |
| `today`      | 今日到期 | dueDate = 今天             |
| `soon`       | 即将到期 | dueDate 在提醒天数范围内   |
| `normal`     | 正常     | dueDate 在提醒天数范围之后 |

### 2.2 创建内部收款记录

- **POST** `/orders/{id}/receipts`

**业务规则：**

- 可用于账期订单回款，也可用于现款订单的内部手工补录收款
- `amount` 未传时，服务端按订单当前剩余应收金额全额入账
- 若订单存在仍处于 `paying` 的在线支付单，拒绝创建内部收款记录
- 若订单存在仍处于 `pending_verification` 的线下登记待确认单，拒绝创建内部收款记录

---
