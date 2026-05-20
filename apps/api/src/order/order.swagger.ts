import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  AdminOrderItem as AdminOrderItemContract,
  CreateOrderPrintFailureResponse as CreateOrderPrintFailureResponseContract,
  CreateOrderReceiptResponse as CreateOrderReceiptResponseContract,
  CreateOrderReminderResponse as CreateOrderReminderResponseContract,
  CreditOrderItem as CreditOrderItemContract,
  OrderLineItem as OrderLineItemContract,
  OrderPrintRecordItem as OrderPrintRecordItemContract,
  OrderPrintRecordResponse as OrderPrintRecordResponseContract,
  OrderPrintRecordsResponse as OrderPrintRecordsResponseContract,
  OrderPrintRecordsSummary as OrderPrintRecordsSummaryContract,
  TenantOrderItem as TenantOrderItemContract,
  TenantPrintRecordItem as TenantPrintRecordItemContract,
  TenantPrintRecordsResponse as TenantPrintRecordsResponseContract,
} from '@shou/types/contracts';
import type { PaginatedResponse } from '@shou/types/common';
import { CreditOrderStatusEnum, OrderPayTypeEnum, OrderStatusEnum, PrintRecordResultEnum } from '@shou/types/enums';
import { PaginatedResponseMetaSwagger } from '../common/swagger/paginated-response.swagger';

export class OrderLineItemSwagger implements OrderLineItemContract {
  @ApiPropertyOptional({ description: '行项目 ID', example: 'e9c3c63d-8fbf-42f0-9008-3f6bb62a137d' })
  itemId?: string;

  @ApiPropertyOptional({ description: '商品主数据 ID', example: 'SKU-001', nullable: true })
  skuId?: string | null;

  @ApiProperty({ description: '商品名称', example: '农夫山泉 550ml' })
  skuName!: string;

  @ApiPropertyOptional({ description: '商品规格', example: '24瓶/箱' })
  skuSpec?: string;

  @ApiProperty({ description: '单位', example: '箱' })
  unit!: string;

  @ApiProperty({ description: '数量', example: 2 })
  quantity!: number;

  @ApiProperty({ description: '单价（元）', example: 48.5 })
  unitPrice!: number;

  @ApiProperty({ description: '行金额（元）', example: 97 })
  lineAmount!: number;
}

export class TenantOrderItemSwagger implements TenantOrderItemContract {
  @ApiProperty({ description: '订单 ID', example: '95dc7f09-5a01-4cae-9071-8d048d4f787c' })
  id!: string;

  @ApiPropertyOptional({ description: '原始 ERP 订单号', example: 'ERP20260410001' })
  sourceOrderNo?: string;

  @ApiPropertyOptional({ description: '防重辅键', example: 'ERP20260410001#张三' })
  groupKey?: string;

  @ApiPropertyOptional({ description: '导入映射模板 ID', example: '1' })
  mappingTemplateId?: string;

  @ApiPropertyOptional({ description: '订单二维码令牌', example: '0b8f8ad4d034c46f...' })
  qrCodeToken?: string;

  @ApiProperty({ description: '客户名称', example: '深圳华强贸易' })
  customer!: string;

  @ApiPropertyOptional({ description: '客户电话；无值时为 null', example: '13800138000', nullable: true })
  customerPhone!: string | null;

  @ApiProperty({ description: '客户地址', example: '深圳市福田区深南大道1001号' })
  customerAddress!: string;

  @ApiProperty({ description: '订单总金额（元）', example: 198.5 })
  totalAmount!: number;

  @ApiProperty({ description: '已收金额（元）', example: 100 })
  paid!: number;

  @ApiProperty({ description: '订单状态', enum: Object.values(OrderStatusEnum), example: OrderStatusEnum.PARTIAL })
  status!: TenantOrderItemContract['status'];

  @ApiProperty({ description: '结算方式', enum: Object.values(OrderPayTypeEnum), example: OrderPayTypeEnum.CASH })
  payType!: TenantOrderItemContract['payType'];

  @ApiProperty({ description: '打印次数', example: 2 })
  prints!: number;

  @ApiPropertyOptional({ description: '最近一次打印成功时间', example: '2026-04-10 12:30:00' })
  lastPrintedAt?: string;

  @ApiProperty({ description: '累计打印失败次数', example: 1 })
  printFailedCount!: number;

  @ApiPropertyOptional({ description: '最近一次打印失败时间', example: '2026-04-10 12:31:00' })
  lastFailedAt?: string;

  @ApiProperty({ description: '下单时间', example: '2026-04-10T12:00:00.000Z' })
  orderTime!: string;

  @ApiProperty({ description: '订单明细', type: [OrderLineItemSwagger] })
  lineItems!: OrderLineItemSwagger[];

  @ApiPropertyOptional({
    description: '自定义字段键值对',
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { customerCode: 'C-001', deliveryRoute: 'A区' },
  })
  customerFieldValues?: Record<string, string>;

  @ApiProperty({ description: '是否已作废', example: false })
  voided!: boolean;

  @ApiPropertyOptional({ description: '作废原因', example: '客户取消订单' })
  voidReason?: string;

  @ApiPropertyOptional({ description: '作废时间', example: '2026-04-10T13:00:00.000Z' })
  voidedAt?: string;
}

export class AdminOrderItemSwagger implements AdminOrderItemContract {
  @ApiProperty({ description: '订单 ID', example: '95dc7f09-5a01-4cae-9071-8d048d4f787c' })
  id!: string;

  @ApiProperty({ description: '所属租户名称', example: '华南一区商户A' })
  tenant!: string;

  @ApiPropertyOptional({ description: '原始 ERP 订单号', example: 'ERP20260410001' })
  sourceOrderNo?: string;

  @ApiPropertyOptional({ description: '防重辅键', example: 'ERP20260410001#张三' })
  groupKey?: string;

  @ApiPropertyOptional({ description: '导入映射模板 ID', example: '1' })
  mappingTemplateId?: string;

  @ApiPropertyOptional({ description: '订单二维码令牌', example: '0b8f8ad4d034c46f...' })
  qrCodeToken?: string;

  @ApiProperty({ description: '客户名称', example: '深圳华强贸易' })
  customer!: string;

  @ApiPropertyOptional({ description: '客户电话；无值时为 null', example: '13800138000', nullable: true })
  customerPhone!: string | null;

  @ApiProperty({ description: '客户地址', example: '深圳市福田区深南大道1001号' })
  customerAddress!: string;

  @ApiProperty({ description: '订单总金额（元）', example: 198.5 })
  totalAmount!: number;

  @ApiProperty({ description: '订单明细', type: [OrderLineItemSwagger] })
  lineItems!: OrderLineItemSwagger[];

  @ApiPropertyOptional({
    description: '自定义字段键值对',
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { customerCode: 'C-001', deliveryRoute: 'A区' },
  })
  customerFieldValues?: Record<string, string>;

  @ApiProperty({ description: '已收金额（元）', example: 100 })
  paid!: number;

  @ApiProperty({ description: '订单状态', enum: Object.values(OrderStatusEnum), example: OrderStatusEnum.PARTIAL })
  status!: AdminOrderItemContract['status'];

  @ApiProperty({ description: '结算方式', enum: Object.values(OrderPayTypeEnum), example: OrderPayTypeEnum.CASH })
  payType!: AdminOrderItemContract['payType'];

  @ApiProperty({ description: '下单时间', example: '2026-04-10T12:00:00.000Z' })
  orderTime!: string;

  @ApiProperty({ description: '是否已作废', example: false })
  voided!: boolean;

  @ApiPropertyOptional({ description: '作废原因', example: '客户取消订单' })
  voidReason?: string;

  @ApiPropertyOptional({ description: '作废时间', example: '2026-04-10T13:00:00.000Z' })
  voidedAt?: string;
}

export class CreditOrderItemSwagger implements CreditOrderItemContract {
  @ApiProperty({ description: '订单 ID' })
  id!: string;

  @ApiProperty({ description: '客户名称' })
  customer!: string;

  @ApiProperty({ description: '订单金额（元）', example: 399 })
  amount!: number;

  @ApiProperty({ description: '下单时间', example: '2026-04-10T12:00:00.000Z' })
  date!: string;

  @ApiProperty({ description: '账期天数', example: 30 })
  creditDays!: number;

  @ApiProperty({ description: '到期日', example: '2026-05-10' })
  dueDate!: string;

  @ApiProperty({
    description: '账期状态',
    enum: Object.values(CreditOrderStatusEnum),
    example: CreditOrderStatusEnum.SOON,
  })
  creditStatus!: CreditOrderItemContract['creditStatus'];
}

export class CreditOrderListResponseSwagger extends PaginatedResponseMetaSwagger implements PaginatedResponse<CreditOrderItemContract> {
  @ApiProperty({ description: '列表数据', type: [CreditOrderItemSwagger] })
  list!: CreditOrderItemSwagger[];
}

export class TenantOrderListResponseSwagger extends PaginatedResponseMetaSwagger implements PaginatedResponse<TenantOrderItemContract> {
  @ApiProperty({ description: '列表数据', type: [TenantOrderItemSwagger] })
  list!: TenantOrderItemSwagger[];
}

export class AdminOrderListResponseSwagger extends PaginatedResponseMetaSwagger implements PaginatedResponse<AdminOrderItemContract> {
  @ApiProperty({ description: '列表数据', type: [AdminOrderItemSwagger] })
  list!: AdminOrderItemSwagger[];
}

export class OrderPrintRecordResponseSwagger implements OrderPrintRecordResponseContract {
  @ApiPropertyOptional({ description: '请求号', example: 'print-order-20260411-001' })
  requestId?: string;

  @ApiProperty({ description: '提交总数；打印成功回执每次只确认单张订单', example: 1 })
  totalCount!: number;

  @ApiProperty({ description: '成功累计打印次数的订单数；成功场景为 1', example: 1 })
  successCount!: number;

  @ApiProperty({ description: '确认时间', example: '2026-04-11T10:00:00.000Z' })
  confirmedAt!: string;

  @ApiPropertyOptional({ description: '备注', example: '一联打印成功' })
  remark?: string;
}

export class CreateOrderPrintFailureResponseSwagger implements CreateOrderPrintFailureResponseContract {
  @ApiProperty() id!: string;

  @ApiProperty() orderId!: string;

  @ApiProperty() reason!: string;

  @ApiProperty() printedAt!: string;

  @ApiProperty({ nullable: true }) operatorName!: string | null;
}

export class OrderPrintRecordItemSwagger implements OrderPrintRecordItemContract {
  @ApiProperty() id!: string;

  @ApiProperty({ enum: Object.values(PrintRecordResultEnum) }) result!: OrderPrintRecordItemContract['result'];

  @ApiProperty({ nullable: true }) failureReason!: string | null;

  @ApiProperty() printedAt!: string;

  @ApiProperty({ nullable: true }) operatorId!: string | null;

  @ApiProperty({ nullable: true }) operatorName!: string | null;

  @ApiProperty({ nullable: true }) requestId!: string | null;

  @ApiProperty({ nullable: true }) remark!: string | null;
}

export class OrderPrintRecordsSummarySwagger implements OrderPrintRecordsSummaryContract {
  @ApiProperty() successCount!: number;

  @ApiProperty() failedCount!: number;

  @ApiProperty({ nullable: true }) lastPrintedAt!: string | null;

  @ApiProperty({ nullable: true }) lastFailedAt!: string | null;
}

export class OrderPrintRecordsResponseSwagger extends PaginatedResponseMetaSwagger implements OrderPrintRecordsResponseContract {
  @ApiProperty({ type: [OrderPrintRecordItemSwagger] })
  list!: OrderPrintRecordItemSwagger[];

  @ApiProperty({ type: OrderPrintRecordsSummarySwagger })
  summary!: OrderPrintRecordsSummarySwagger;
}

export class TenantPrintRecordItemSwagger implements TenantPrintRecordItemContract {
  @ApiProperty() id!: string;

  @ApiProperty() orderId!: string;

  @ApiProperty() sourceOrderNo!: string;

  @ApiProperty() customer!: string;

  @ApiProperty({ enum: Object.values(PrintRecordResultEnum) }) result!: TenantPrintRecordItemContract['result'];

  @ApiProperty({ nullable: true }) failureReason!: string | null;

  @ApiProperty() printedAt!: string;

  @ApiProperty({ nullable: true }) operatorId!: string | null;

  @ApiProperty({ nullable: true }) operatorName!: string | null;

  @ApiProperty({ nullable: true }) remark!: string | null;
}

export class TenantPrintRecordsSummarySwagger {
  @ApiProperty() successCount!: number;

  @ApiProperty() failedCount!: number;
}

export class TenantPrintRecordsResponseSwagger extends PaginatedResponseMetaSwagger implements TenantPrintRecordsResponseContract {
  @ApiProperty({ type: [TenantPrintRecordItemSwagger] })
  list!: TenantPrintRecordItemSwagger[];

  @ApiProperty({ type: TenantPrintRecordsSummarySwagger })
  summary!: TenantPrintRecordsSummarySwagger;
}

export class CreateOrderReminderResponseSwagger implements CreateOrderReminderResponseContract {
  @ApiProperty({ description: '是否发送成功', example: true })
  sent!: boolean;

  @ApiProperty({ description: '实际发送渠道', type: [String], example: ['sms', 'wechat'] })
  channels!: string[];
}

export class CreateOrderReceiptResponseSwagger implements CreateOrderReceiptResponseContract {
  @ApiProperty({ description: '订单 ID' })
  orderId!: string;

  @ApiProperty({
    description: '内部收款后的订单状态',
    enum: Object.values(OrderStatusEnum),
    example: OrderStatusEnum.PAID,
  })
  status!: CreateOrderReceiptResponseContract['status'];

  @ApiProperty({ description: '内部收款后的累计已收金额（元）', example: 198.5 })
  paid!: number;
}
