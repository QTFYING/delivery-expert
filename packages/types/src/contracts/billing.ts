import type { BillingPackageStatus, ContractStatus, ContractType, InvoiceStatus } from '../enums';

export interface PackagePlanItem {
  /** 套餐 ID */
  id: string;
  /** 套餐名称 */
  name: string;
  /** 套餐价格 */
  price: string;
  /** 平台抽成费率 */
  rate: string;
  /** 当前使用租户数 */
  tenants: number;
  /** 结算策略 */
  strategy: string;
  /** 订单趋势摘要 */
  orderTrend: string;
  /** 套餐特性列表 */
  features: string[];
  /** 套餐状态 */
  status: BillingPackageStatus;
}

export interface CreatePackagePlanRequest {
  /** 套餐名称 */
  name: string;
  /** 套餐价格 */
  price: string;
  /** 平台抽成费率 */
  rate: string;
  /** 结算策略 */
  strategy: string;
  /** 套餐特性列表 */
  features: string[];
}

export interface UpdatePackagePlanRequest {
  /** 套餐名称 */
  name?: string;
  /** 套餐价格 */
  price?: string;
  /** 平台抽成费率 */
  rate?: string;
  /** 结算策略 */
  strategy?: string;
  /** 套餐特性列表 */
  features?: string[];
}

export interface ContractRecordItem {
  /** 合同编号 */
  contractNo: string;
  /** 租户名称 */
  tenant: string;
  /** 合同类型 */
  type: ContractType;
  /** 到期时间 */
  expireAt: string;
  /** 合同状态 */
  status: ContractStatus;
  /** 终止原因 */
  terminateReason?: string;
}

export interface CreateContractRequest {
  /** 租户名称 */
  tenant: string;
  /** 联系人姓名 */
  contactName: string;
  /** 联系电话 */
  phone: string;
  /** 套餐名称 */
  packageName: string;
  /** 年费 */
  annualFee: string;
  /** 平台抽成费率 */
  rate: string;
  /** 服务开始日期 */
  serviceStart: string;
  /** 服务结束日期 */
  serviceEnd: string;
}

export interface UpdateContractRequest {
  /** 联系人姓名 */
  contactName?: string;
  /** 联系电话 */
  phone?: string;
  /** 套餐名称 */
  packageName?: string;
  /** 年费 */
  annualFee?: string;
  /** 平台抽成费率 */
  rate?: string;
  /** 服务开始日期 */
  serviceStart?: string;
  /** 服务结束日期 */
  serviceEnd?: string;
}

export interface CreateContractResponse {
  /** 合同编号 */
  contractNo: string;
  /** 电子签约链接 */
  signLink: string;
  /** 是否已发送短信 */
  smsSent: boolean;
}

export interface CreateContractApprovalRequest {
  /** 审批备注 */
  remark?: string;
}

export interface ContractActionResponse {
  /** 合同编号 */
  contractNo: string;
  /** 合同状态 */
  status: ContractStatus;
  /** 生效时间 */
  effectiveAt: string;
  /** 终止原因 */
  terminateReason?: string;
}

export interface CreateContractTerminationRequest {
  /** 终止原因 */
  terminateReason: string;
}

export interface InvoiceRecordItem {
  /** 账单编号 */
  billNo: string;
  /** 租户名称 */
  tenant: string;
  /** 开票金额 */
  amount: string;
  /** 账单周期 */
  cycle: string;
  /** 发票状态 */
  status: InvoiceStatus;
  /** 开票时间 */
  issuedAt?: string | null;
}

export interface CreateInvoiceRequest {
  /** 租户名称 */
  tenant: string;
  /** 账单周期 */
  cycle: string;
  /** 开票金额 */
  amount: string;
  /** 税率 */
  taxRate?: number;
}

export interface CreateInvoiceResponse {
  /** 账单编号 */
  billNo: string;
  /** 发票状态 */
  status: InvoiceStatus;
}

export interface PatchInvoiceStatusRequest {
  /** 作废原因 */
  voidReason: string;
}
