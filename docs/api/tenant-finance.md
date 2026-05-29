# Tenant 流水

> 本文件承接 Tenant 流水核心功能的业务语义，包括收款流水、现金核销、收款汇总、财务汇总、对账明细与对账导出
> 若本文件的领域细节与 [tenant-api-doc.md](./tenant-api-doc.md) 的全局边界冲突，以全局边界为准

## 一、收款流水与核销

> Tenant 侧负责查看本租户收款流水，并确认 H5 线下登记支付；H5 负责发起客户侧支付动作。

### 契约约定

- 支付页与租户侧收款链路统一使用 `PaymentOrderStatus` 与 `PaymentRecordStatus` 两组闭集
- 收款流水、汇总统计和现金核销均按当前登录态 `tenantId` 自动隔离
- H5 在线支付成功后生成的收款记录进入 Tenant 收款流水

### 1.1 获取收款流水列表

- **GET** `/payments`
- **权限**：`payments.read`

**契约类型：** 请求：`PaymentListQuery`；响应：`PaginatedResponse<TenantPaymentRecordItem>`

### 1.2 获取收款汇总统计

- **GET** `/payments/summary`
- **权限**：`payments.read`

**契约类型：** 响应：`PaymentSummaryResponse`

### 1.3 创建线下登记确认记录

- **POST** `/orders/{id}/cash-verifications`
- **权限**：`payments.cash_verify.create`

**契约类型：** 响应：`CreateCashVerificationResponse`

**业务规则：**

- 只允许处理 `pending_verification` 状态的线下登记支付单
- 确认成功后写入收款记录，并同步更新订单已收金额与订单状态
- 现金核销影响收款和对账，不属于普通订单只读能力

## 二、财务对账

> Tenant 财务视角只处理本租户财务汇总、对账明细和导出。

### 契约约定

- 对账状态统一使用闭集 `FinanceReconciliationStatus`
- 财务导出属于数据外流能力，默认只开放给财务岗位

### 2.1 获取财务汇总

- **GET** `/finance/summary`
- **权限**：`finance.read`

**契约类型：** 响应：`FinanceSummaryResponse`

### 2.2 获取对账明细

- **GET** `/finance/reconciliation`
- **权限**：`finance.read`

**契约类型：** 请求：`FinanceReconciliationQuery`；响应：`PaginatedResponse<FinanceReconciliationRecordItem>`

### 2.3 导出对账单

- **GET** `/finance/reconciliation/export`
- **权限**：`finance.export`
- **Content-Type**：`application/octet-stream`

**响应：** Excel 文件流
