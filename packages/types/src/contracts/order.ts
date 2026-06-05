import type { ListParams } from '../common';
import type { OfflinePaymentInfo } from './payment';
import type {
  CreditOrderStatus,
  CreditType,
  OrderImportConflictPolicy,
  OrderImportJobStatus,
  OrderImportTemplateFieldSourceType,
  OrderPayType,
  OrderSearchStatus,
  OrderStatus,
  PrintRecordResult,
} from '../enums';

export interface OrderLineItem {
  /** 行项目 ID */
  itemId?: string;
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
  /** 包装规格，例如 24桶，用于表达 1箱 = 153g * 24桶 */
  packSpec?: string;
  /** 单价 单位元 */
  unitPrice: number;
  /** 行金额 单位元 */
  lineAmount: number;
  /** 商品行级自定义字段值 */
  customerFieldValues?: Record<string, string>;
}

export interface TenantOrderItem {
  /** 订单 ID */
  id: string;
  /** 源订单号 */
  sourceOrderNo?: string;
  /** 防重分组键 */
  groupKey?: string;
  /** 导入映射模板 ID */
  mappingTemplateId?: string;
  /** H5 公开入口令牌 */
  qrCodeToken?: string;
  /** 客户名称 */
  customer: string;
  /** 客户电话 */
  customerPhone: string | null;
  /** 客户地址 */
  customerAddress: string;
  /** 订单总金额 单位元 */
  totalAmount: number;
  /** 已收金额 单位元 */
  paid: number;
  /** H5 线下登记信息；未登记时为 null */
  offlinePayment: OfflinePaymentInfo | null;
  /** 订单状态 */
  status: OrderStatus;
  /** 结算方式 */
  payType: OrderPayType;
  /** 账期子类型，现款订单为 null */
  creditType?: CreditType | null;
  /** 账期天数，现款订单为 null */
  creditDays?: number | null;
  /** 应收款到期日，现款订单为 null */
  dueDate?: string | null;
  /** 打印成功次数 */
  prints: number;
  /** 最近打印成功时间 */
  lastPrintedAt?: string;
  /** 打印失败次数 */
  printFailedCount: number;
  /** 最近打印失败时间 */
  lastFailedAt?: string;
  /** 下单时间，支持 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss */
  orderTime: string;
  /** 订单商品明细 */
  lineItems: OrderLineItem[];
  /** 订单级自定义字段值，仅承载导入模板 type=list 的自定义字段 */
  customerFieldValues?: Record<string, string>;
  /** 是否已作废 */
  voided: boolean;
  /** 作废原因 */
  voidReason?: string;
  /** 作废时间 */
  voidedAt?: string;
}

export type TenantOrderListItem = Omit<TenantOrderItem, 'lineItems'>;

export interface AdminOrderItem {
  /** 订单 ID */
  id: string;
  /** 所属租户 */
  tenant: string;
  /** 源订单号 */
  sourceOrderNo?: string;
  /** 防重分组键 */
  groupKey?: string;
  /** 导入映射模板 ID */
  mappingTemplateId?: string;
  /** H5 公开入口令牌 */
  qrCodeToken?: string;
  /** 客户名称 */
  customer: string;
  /** 客户电话 */
  customerPhone: string | null;
  /** 客户地址 */
  customerAddress: string;
  /** 订单总金额 单位元 */
  totalAmount: number;
  /** 已收金额 单位元 */
  paid: number;
  /** 订单状态 */
  status: OrderStatus;
  /** 结算方式 */
  payType: OrderPayType;
  /** 账期子类型，现款订单为 null */
  creditType?: CreditType | null;
  /** 账期天数，现款订单为 null */
  creditDays?: number | null;
  /** 应收款到期日，现款订单为 null */
  dueDate?: string | null;
  /** 下单时间 */
  orderTime: string;
  /** 订单商品明细 */
  lineItems: OrderLineItem[];
  /** 订单级自定义字段值，仅承载导入模板 type=list 的自定义字段 */
  customerFieldValues?: Record<string, string>;
  /** 是否已作废 */
  voided: boolean;
  /** 作废原因 */
  voidReason?: string;
  /** 作废时间 */
  voidedAt?: string;
}

export interface OrderListQuery extends ListParams {
  /** 订单状态筛选；本期仅开放 pending / paid / expired */
  status?: OrderSearchStatus;
  /** 结算方式筛选 */
  payType?: OrderPayType;
  /** 账期子类型筛选；有值时仅适用于 payType=credit */
  creditType?: CreditType;
  /** 导入映射模板筛选 */
  mappingTemplateId?: string;
  /** 源订单号筛选 */
  sourceOrderNo?: string;
  /** 开始日期 */
  dateFrom?: string;
  /** 结束日期 */
  dateTo?: string;
}

export interface AdminOrderListQuery {
  /** 页码 */
  page: number;
  /** 每页条数 */
  pageSize: number;
  /** 搜索关键词 */
  keyword?: string;
}

export interface CreateOrderRequest {
  /** 客户名称 */
  customer: string;
  /** 客户电话 */
  customerPhone?: string | null;
  /** 客户地址 */
  customerAddress?: string;
  /** 商品摘要 */
  summary?: string;
  /** 订单总金额 */
  amount: number;
  /** 已收金额 */
  paid?: number;
  /** 订单状态 */
  status?: OrderStatus;
  /** 结算方式 */
  payType?: OrderPayType;
  /** 下单时间 */
  date?: string;
}

export interface UpdateOrderRequest {
  /** 客户名称 */
  customer?: string;
  /** 客户电话 */
  customerPhone?: string | null;
  /** 客户地址 */
  customerAddress?: string;
  /** 商品摘要 */
  summary?: string;
  /** 订单总金额 */
  amount?: number;
  /** 已收金额 */
  paid?: number;
  /** 订单状态 */
  status?: OrderStatus;
  /** 结算方式 */
  payType?: OrderPayType;
  /** 下单时间 */
  date?: string;
  /** 商品明细 */
  lineItems?: OrderLineItem[];
  /** 订单级自定义字段值 */
  customerFieldValues?: Record<string, string>;
}

export interface VoidOrderRequest {
  /** 作废原因 */
  voidReason: string;
}

export interface OrderImportTemplateField {
  /**
   * 字段展示名
   */
  label: string;
  /**
   * 字段 key系统字段使用稳定 key，自定义字段由服务端补 `cfN`
   */
  key: string;
  /**
   * Excel / ERP 表头映射值
   */
  mapStr: string;
  /**
   * 是否系统必填仅控制前端 UI 展示（红星/必填提示），不参与 /preview 服务端校验
   */
  isRequired: boolean;
  /**
   * 服务端 /preview 校验开关`true` 表示导入预检时该列必须有值；`false` 则允许空值通过
   * 保存请求不接收该字段；响应侧由服务端始终填充
   */
  isValueRequired?: boolean;
  /**
   * 字段来源：`list` 表示订单头，`line` 表示订单明细
   * 旧模板数据可能缺失该字段，读取时按 `list` 兼容
   */
  type?: OrderImportTemplateFieldSourceType;
}

export interface OrderImportTemplateFieldMappingRequest {
  /**
   * 字段 key系统字段使用稳定 key，自定义字段更新时传回服务端生成的 `cfN`
   */
  key?: string;
  /**
   * 字段展示名
   */
  label: string;
  /**
   * Excel / ERP 表头映射值；未传或为 `null` 时按空字符串处理
   */
  mapStr?: string | null;
  /**
   * 字段来源：`list` 表示订单头，`line` 表示订单明细
   */
  type: OrderImportTemplateFieldSourceType;
}

export interface OrderImportDefaultFieldMappingRequest extends OrderImportTemplateFieldMappingRequest {
  /**
   * 系统字段稳定 key，必须命中服务端内置默认模板字段
   */
  key: string;
}

export interface OrderImportCustomerFieldCreateRequest extends OrderImportTemplateFieldMappingRequest {}

export interface OrderImportCustomerFieldUpdateRequest extends OrderImportTemplateFieldMappingRequest {
  /**
   * 自定义字段 key；已有字段编辑时必须传回原 key，新增字段不传，由服务端生成 `cfN`
   */
  key?: string;
}

export interface OrderImportTemplate {
  /** 模板 ID */
  id: string;
  /** 模板名称 */
  name: string;
  /** 是否默认模板 */
  isDefault: boolean;
  /** 最近更新时间 */
  updatedAt: string;
  /** 系统默认字段 */
  defaultFields: OrderImportTemplateField[];
  /** 租户自定义字段 */
  customerFields: OrderImportTemplateField[];
}

export interface OrderImportTemplateMutationResponse {
  /** 模板 ID */
  id: string;
  /** 模板名称 */
  name: string;
  /** 是否默认模板 */
  isDefault: boolean;
  /** 最近更新时间 */
  updatedAt: string;
}

export interface CreateOrderImportTemplateRequest {
  /** 模板名称 */
  name: string;
  /** 是否设为默认模板 */
  isDefault: boolean;
  /** 系统默认字段映射 */
  defaultFields: OrderImportDefaultFieldMappingRequest[];
  /** 租户自定义字段 */
  customerFields: OrderImportCustomerFieldCreateRequest[];
}

export interface UpdateOrderImportTemplateRequest {
  /** 模板名称 */
  name?: string;
  /** 是否设为默认模板 */
  isDefault?: boolean;
  /** 系统默认字段映射 */
  defaultFields?: OrderImportDefaultFieldMappingRequest[];
  /** 租户自定义字段 */
  customerFields?: OrderImportCustomerFieldUpdateRequest[];
}

export interface OrderImportPreviewOrder {
  /** 源订单号 */
  sourceOrderNo: string;
  /** 防重分组键 */
  groupKey?: string;
  /** 客户名称 */
  customer: string;
  /** 客户电话 */
  customerPhone?: string | null;
  /** 客户地址，可省略；服务端预检响应会归一化为空字符串 */
  customerAddress?: string | null;
  /** 订单总金额，导入预检允许为 0，不允许为负数 */
  totalAmount: number | string;
  /** 下单时间 */
  orderTime: string;
  /** 原始结算方式文本，必填；若源文件为空，前端应按用户选择补入 cash 或其他明确结算方式 */
  payType: string;
  /** 订单级自定义字段值，仅承载导入模板 type=list 的自定义字段 */
  customerFieldValues?: Record<string, string>;
  /** 商品明细 */
  lineItems: OrderLineItem[];
}

export interface OrderImportPreviewOrderResult {
  /** 源订单号 */
  sourceOrderNo: string;
  /** 防重分组键 */
  groupKey?: string;
  /** 客户名称 */
  customer: string;
  /** 客户电话 */
  customerPhone: string | null;
  /** 客户地址 */
  customerAddress: string;
  /** 标准化后的订单总金额，允许为 0，不允许为负数 */
  totalAmount: number;
  /** 下单时间 */
  orderTime: string;
  /** 标准化后的结算方式 */
  payType: OrderPayType;
  /** 标准化后的账期子类型，现款订单为 null */
  creditType?: CreditType | null;
  /** 标准化后的账期天数，现款订单为 null */
  creditDays?: number | null;
  /** 标准化后的应收款到期日，现款订单为 null */
  dueDate?: string | null;
  /** 订单级自定义字段值，仅承载导入模板 type=list 的自定义字段 */
  customerFieldValues: Record<string, string>;
  /** 映射模板 ID */
  mappingTemplateId?: string;
  /** 商品明细 */
  lineItems: OrderLineItem[];
}

export interface OrderImportPreviewSummary {
  /** 预检订单总数 */
  totalOrders: number;
  /** 有效订单数 */
  validOrders: number;
  /** 无效订单数 */
  invalidOrders: number;
  /** 重复订单数 */
  duplicateOrderCount: number;
  /** 错误数 */
  errorCount: number;
}

export interface OrderImportPreviewError {
  /** 行号 */
  index: number;
  /** 出错字段 */
  field?: string;
  /** 源订单号 */
  sourceOrderNo?: string;
  /** 错误原因 */
  reason: string;
}

export interface OrderImportDuplicateOrder {
  /** 源订单号 */
  sourceOrderNo: string;
  /** 已存在订单 ID */
  existingOrderId?: string;
  /** 已存在订单客户名称 */
  customer?: string;
  /** 已存在订单总金额，允许为 0，不允许为负数 */
  totalAmount?: number;
  /** 已存在订单状态 */
  existingStatus?: OrderStatus;
  /** 本次导入中出现次数 */
  incomingCount: number;
}

export interface OrderImportPreviewRequest {
  /** 模板 ID */
  templateId: string;
  /** 待预检订单列表 */
  orders: OrderImportPreviewOrder[];
}

export interface OrderImportPreviewResponse {
  /** 预检快照 ID */
  previewId: string;
  /** 模板 ID */
  templateId: string;
  /** 预检统计 */
  summary: OrderImportPreviewSummary;
  /** 通过预检的订单 */
  orders: OrderImportPreviewOrderResult[];
  /** 与存量冲突的订单 */
  duplicateOrders: OrderImportDuplicateOrder[];
  /** 校验失败的订单 */
  invalidOrders: OrderImportPreviewError[];
}

export interface OrderImportSubmitRequest {
  /** 预检快照 ID */
  previewId: string;
  /** 冲突处理策略 */
  conflictPolicy?: OrderImportConflictPolicy;
}

export interface OrderImportSubmitResponse {
  /** 导入任务 ID */
  jobId: string;
  /** 预检快照 ID */
  previewId: string;
  /** 提交订单数 */
  submittedCount: number;
  /** 任务状态 */
  status: OrderImportJobStatus;
}

export interface OrderImportJobFailure {
  /** 失败行号 */
  index?: number;
  /** 失败订单源订单号 */
  sourceOrderNo?: string;
  /** 失败原因 */
  reason: string;
}

export interface OrderImportJobConflictDetail {
  /** 源订单号 */
  sourceOrderNo: string;
  /** 已存在订单 ID */
  existingOrderId?: string;
  /** 处理动作 */
  action: OrderImportConflictPolicy;
  /** 冲突原因 */
  reason: string;
}

export interface OrderImportJobResponse {
  /** 导入任务 ID */
  jobId: string;
  /** 预检快照 ID */
  previewId: string;
  /** 任务状态 */
  status: OrderImportJobStatus;
  /** 提交订单数 */
  submittedCount: number;
  /** 已处理数量 */
  processedCount: number;
  /** 成功导入数量 */
  successCount: number;
  /** 跳过数量 */
  skippedCount: number;
  /** 覆盖写入数量 */
  overwrittenCount: number;
  /** 失败数量 */
  failedCount: number;
  /** 失败订单列表 */
  failedOrders: OrderImportJobFailure[];
  /** 冲突明细 */
  conflictDetails: OrderImportJobConflictDetail[];
  /** 完成时间 */
  completedAt?: string;
}

export interface OrderExportQuery extends OrderListQuery {
  /** 指定导出订单 ID 列表 */
  ids?: string[];
}

export interface OrderPrintRecordRequest {
  /** 推荐使用：本次实际打印成功的单张订单 ID */
  orderId?: string;
  /** @deprecated 兼容旧前端；若传入，长度必须为 1 */
  orderIds?: string[];
  /** 打印请求 ID */
  requestId?: string;
  /** 备注 */
  remark?: string;
}

export interface OrderPrintRecordResponse {
  /** 打印请求 ID */
  requestId?: string;
  /** 提交总数 */
  totalCount: number;
  /** 成功确认数 */
  successCount: number;
  /** 确认时间 */
  confirmedAt: string;
  /** 备注 */
  remark?: string;
}

export interface CreateOrderPrintFailureRequest {
  /** 失败原因 */
  reason: string;
  /** 打印请求 ID */
  requestId?: string;
  /** 备注 */
  remark?: string;
}

export interface CreateOrderPrintFailureResponse {
  /** 失败记录 ID */
  id: string;
  /** 订单 ID */
  orderId: string;
  /** 失败原因 */
  reason: string;
  /** 记录时间 */
  printedAt: string;
  /** 操作人姓名 */
  operatorName: string | null;
}

export interface OrderPrintRecordsQuery {
  /** 页码 */
  page?: number;
  /** 每页条数 */
  pageSize?: number;
  /** 打印结果筛选 */
  result?: PrintRecordResult;
  /** 开始日期 */
  dateFrom?: string;
  /** 结束日期 */
  dateTo?: string;
}

export interface OrderPrintRecordItem {
  /** 打印记录 ID */
  id: string;
  /** 打印结果 */
  result: PrintRecordResult;
  /** 失败原因 */
  failureReason: string | null;
  /** 记录时间 */
  printedAt: string;
  /** 操作人 ID */
  operatorId: string | null;
  /** 操作人姓名 */
  operatorName: string | null;
  /** 打印请求 ID */
  requestId: string | null;
  /** 备注 */
  remark: string | null;
}

export interface OrderPrintRecordsSummary {
  /** 成功次数 */
  successCount: number;
  /** 失败次数 */
  failedCount: number;
  /** 最近成功时间 */
  lastPrintedAt: string | null;
  /** 最近失败时间 */
  lastFailedAt: string | null;
}

export interface OrderPrintRecordsResponse {
  /** 打印记录列表 */
  list: OrderPrintRecordItem[];
  /** 总数 */
  total: number;
  /** 页码 */
  page: number;
  /** 每页条数 */
  pageSize: number;
  /** 统计摘要 */
  summary: OrderPrintRecordsSummary;
}

export interface TenantPrintRecordsQuery {
  /** 页码 */
  page?: number;
  /** 每页条数 */
  pageSize?: number;
  /** 打印结果筛选 */
  result?: PrintRecordResult;
  /** 开始日期 */
  dateFrom?: string;
  /** 结束日期 */
  dateTo?: string;
  /** 操作人 ID 筛选 */
  operatorId?: string;
  /** 订单 ID 筛选 */
  orderId?: string;
  /** 搜索关键词 */
  keyword?: string;
}

export interface TenantPrintRecordItem {
  /** 打印记录 ID */
  id: string;
  /** 订单 ID */
  orderId: string;
  /** 源订单号 */
  sourceOrderNo: string;
  /** 客户名称 */
  customer: string;
  /** 打印结果 */
  result: PrintRecordResult;
  /** 失败原因 */
  failureReason: string | null;
  /** 记录时间 */
  printedAt: string;
  /** 操作人 ID */
  operatorId: string | null;
  /** 操作人姓名 */
  operatorName: string | null;
  /** 备注 */
  remark: string | null;
}

export interface TenantPrintRecordsResponse {
  /** 打印记录列表 */
  list: TenantPrintRecordItem[];
  /** 总数 */
  total: number;
  /** 页码 */
  page: number;
  /** 每页条数 */
  pageSize: number;
  /** 汇总信息 */
  summary: {
    /** 成功次数 */
    successCount: number;
    /** 失败次数 */
    failedCount: number;
  };
}

export interface CreateOrderReminderRequest {
  /** 催款渠道列表 */
  channels?: string[];
}

export interface CreateOrderReminderResponse {
  /** 是否发送成功 */
  sent: boolean;
  /** 实际发送渠道 */
  channels: string[];
}

export interface CreditOrderItem {
  /** 订单 ID */
  id: string;
  /** 客户名称 */
  customer: string;
  /** 金额 */
  amount: number;
  /** 结算方式，账期管理列表固定为 credit */
  payType: 'credit';
  /** 账期子类型 */
  creditType: CreditType;
  /** 下单日期 */
  date: string;
  /** 账期天数 */
  creditDays: number;
  /** 到期日期 */
  dueDate: string;
  /** 账期状态 */
  creditStatus: CreditOrderStatus;
}

export interface CreditOrderListQuery extends ListParams {
  /** 订单状态筛选；本期仅开放 pending / paid / expired */
  status?: OrderSearchStatus;
}

export interface CreateOrderReceiptRequest {
  /** 本次内部收款金额 单位元 */
  amount?: number;
  /** 内部收款备注 */
  remark?: string;
  /** 幂等键 */
  idempotencyKey?: string;
}

export interface CreateOrderReceiptResponse {
  /** 订单 ID */
  orderId: string;
  /** 内部收款后的订单状态 */
  status: OrderStatus;
  /** 内部收款后的累计已收金额 单位元 */
  paid: number;
}
