# Tenant 流水

> 本文件承接 Tenant 流水核心功能的业务语义，包括收款流水、线下登记确认、收款汇总、财务汇总、对账明细与对账导出
> 若本文件的领域细节与 [tenant-api-doc.md](./tenant-api-doc.md) 的全局边界冲突，以全局边界为准

## 一、收款流水与线下登记确认

> Tenant 侧负责查看本租户收款流水，并确认 H5 线下登记支付；H5 负责发起客户侧支付动作。

### 1.1 获取收款流水列表

- **GET** `/payments`

### 1.2 获取收款汇总统计

- **GET** `/payments/summary`

### 1.3 创建线下登记确认记录

- **POST** `/orders/{id}/offline-payment-verifications`

**业务规则：**

- 只处理 H5 已登记但待租户确认的线下支付，覆盖 `cash` 与 `other_paid`
- 确认成功后写入收款记录，并同步更新订单已收金额与订单状态
- 线下登记确认影响收款和对账，不属于普通订单只读能力

## 二、财务对账

> Tenant 财务视角只处理本租户财务汇总、对账明细和导出。

### 2.1 获取财务汇总

- **GET** `/finance/summary`

### 2.2 获取对账明细

- **GET** `/finance/reconciliation`

### 2.3 导出对账单

- **GET** `/finance/reconciliation/export`
