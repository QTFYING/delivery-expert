import type { ListParams } from '../common';
import type { OfflinePaymentVerifyStatus, OfflinePaymentMethod, OrderStatus, PaymentMethod, PaymentOrderStatus, PaymentRecordStatus } from '../enums';

export interface PaymentOrderLineItem {
  /** 行项目 ID */
  itemId: string;
  /** 商品主数据 ID */
  skuId?: string | null;
  /** 商品名称 */
  skuName: string;
  /** 商品规格 */
  skuSpec?: string;
  /** 单位 */
  unit: string;
  /** 数量 */
  quantity: number;
  /** 单价，单位元 */
  unitPrice: number;
  /** 行金额，单位元 */
  lineAmount: number;
}

export interface OfflinePaymentInfo {
  /** 线下支付方式 */
  method: OfflinePaymentMethod;
  /** 备注信息 */
  remark: string;
  /** 线下登记确认状态；现金和其他方式已支付登记时有值 */
  offlineVerifyStatus: OfflinePaymentVerifyStatus | null;
  /** 线下确认状态展示文案 */
  offlineVerifyStatusText: string;
  /** 线下支付登记时间 */
  submittedAt: string;
  /** 财务确认时间 */
  verifiedAt?: string | null;
}

export interface PaymentAction {
  /** 是否允许继续当前未过期的第三方收银台支付尝试 */
  canResume: boolean;
  /** 当前支付尝试的继续支付地址；不可继续时为 `null` */
  resumeUrl: string | null;
  /** 是否允许重新发起在线支付 */
  canInitiate: boolean;
  /** 订单可发起支付的最大时间；以下单日期和租户支付有效期配置按自然日计算 */
  expiresAt: string | null;
}

export interface OfflinePaymentAction {
  /** 是否允许提交新的线下支付登记 */
  canSubmit: boolean;
  /** 不允许线下登记时的原因；允许时为 `null` */
  reason: string | null;
}

export interface PaymentOrderDetailResponse {
  /** 订单号 */
  orderNo: string;
  /** 商户名称 */
  merchant: string;
  /** 客户名称 */
  customer: string;
  /** 订单总金额，单位元 */
  amount: number;
  /** 已付金额，单位元 */
  paidAmount: number;
  /** 商品摘要 */
  summary: string;
  /** 下单时间 */
  date: string;
  /** 当前 H5 页面应展示的 H5 支付状态 */
  status: PaymentOrderStatus;
  /** 状态说明文案 */
  statusMessage?: string;
  /** 客服电话 */
  servicePhone?: string;
  /** 当前已选择的支付方式 */
  selectedPaymentMethod: PaymentMethod | null;
  /** 当前订单允许的在线支付动作 */
  paymentAction: PaymentAction;
  /** 当前订单允许的线下登记动作 */
  offlinePaymentAction: OfflinePaymentAction;
  /** 线下支付详情；未登记时为 `null` */
  offlinePayment: OfflinePaymentInfo | null;
  /** 订单商品明细 */
  items: PaymentOrderLineItem[];
}

export interface InitiatePaymentResponse {
  /** 支付网关原生收银台跳转链接 */
  cashierUrl: string;
  /** 业务系统订单 ID */
  orderId: string;
  /** 服务端计算出的本次定额支付金额，元单位字符串 */
  payableAmount: string;
}

export interface SubmitOfflinePaymentRequest {
  /** 线下支付方式 */
  paymentMethod: OfflinePaymentMethod;
  /** 备注；线下登记时必填 */
  remark?: string;
}

export interface SubmitOfflinePaymentResponse {
  /** 订单号 */
  orderNo: string;
  /** 更新后的 H5 支付状态 */
  status: PaymentOrderStatus;
  /** 状态说明文案 */
  statusMessage?: string;
  /** 当前已选择的支付方式 */
  selectedPaymentMethod: PaymentMethod | null;
  /** 线下支付详情；未登记时为 `null` */
  offlinePayment: OfflinePaymentInfo | null;
}

export interface PaymentStatusResponse {
  /** 订单号 */
  orderNo: string;
  /** 当前 H5 页面应展示的 H5 支付状态 */
  status: PaymentOrderStatus;
  /** 状态说明文案 */
  statusMessage?: string;
  /** 已付金额；支付完成时返回 */
  paidAmount?: number;
  /** 支付完成时间 */
  paidAt?: string;
  /** 当前已选择的支付方式 */
  selectedPaymentMethod?: PaymentMethod;
  /** 当前订单允许的在线支付动作 */
  paymentAction: PaymentAction;
  /** 当前订单允许的线下登记动作 */
  offlinePaymentAction: OfflinePaymentAction;
}

export interface CreateOfflinePaymentVerificationRequest {
  /** 财务确认备注；选填，最长 255 字 */
  remark?: string;
}

export interface CreateOfflinePaymentVerificationResponse {
  /** 订单 ID */
  orderId: string;
  /** 确认后的业务订单状态 */
  orderStatus: OrderStatus;
  /** 确认后的 H5 支付状态 */
  paymentStatus: PaymentOrderStatus;
  /** 线下登记确认完成时间 */
  verifiedAt: string;
}

export interface TenantPaymentRecordItem {
  /** 流水号 */
  id: string;
  /** 关联订单号 */
  orderId: string;
  /** 客户名称 */
  customer: string;
  /** 收款金额，单位元 */
  amount: number;
  /** 收款通道 */
  channel: string;
  /** 手续费，单位元 */
  fee: number;
  /** 到账金额，单位元 */
  net: number;
  /** 收款流水状态 */
  status: PaymentRecordStatus;
  /** 收款时间 */
  paidAt: string;
}

export interface AdminPaymentRecordItem {
  /** 流水号 */
  id: string;
  /** 所属租户名称 */
  tenant: string;
  /** 关联订单号 */
  orderId: string;
  /** 客户名称 */
  customer: string;
  /** 收款金额，单位元 */
  amount: number;
  /** 收款通道 */
  channel: string;
  /** 手续费，单位元 */
  fee: number;
  /** 到账金额，单位元 */
  net: number;
  /** 收款时间 */
  time: string;
  /** 收款流水状态 */
  status: PaymentRecordStatus;
}

export interface PaymentListQuery extends ListParams {
  /** 支付通道筛选 */
  channel?: string;
}

export interface AdminPaymentListQuery {
  /** 页码 */
  page: number;
  /** 每页条数 */
  pageSize: number;
  /** 搜索关键词 */
  keyword?: string;
  /** 支付通道筛选 */
  channel?: string;
}

export interface PaymentSummaryResponse {
  /** 收款总金额，单位元 */
  totalAmount: number;
  /** 手续费总额，单位元 */
  totalFee: number;
  /** 到账总额，单位元 */
  totalNet: number;
  /** 收款笔数 */
  totalCount: number;
  /** 异常笔数 */
  abnormalCount: number;
}
