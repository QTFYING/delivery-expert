import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  AdminPaymentRecordItem as AdminPaymentRecordItemContract,
  CreateOfflinePaymentVerificationResponse as CreateOfflinePaymentVerificationResponseContract,
  InitiatePaymentResponse as InitiatePaymentResponseContract,
  OfflinePaymentInfo as OfflinePaymentInfoContract,
  OfflinePaymentAction as OfflinePaymentActionContract,
  PaymentAction as PaymentActionContract,
  PaymentOrderDetailResponse as PaymentOrderDetailResponseContract,
  PaymentOrderLineItem as PaymentOrderLineItemContract,
  PaymentStatusResponse as PaymentStatusResponseContract,
  PaymentSummaryResponse as PaymentSummaryResponseContract,
  SubmitOfflinePaymentResponse as SubmitOfflinePaymentResponseContract,
  TenantPaymentRecordItem as TenantPaymentRecordItemContract,
} from '@shou/types/contracts';
import type { PaginatedResponse } from '@shou/types/common';
import {
  OfflinePaymentVerifyStatusEnum,
  OfflinePaymentMethodEnum,
  OrderStatusEnum,
  PaymentMethodEnum,
  PaymentOrderStatusEnum,
  PaymentRecordStatusEnum,
} from '@shou/types/enums';
import { PaginatedResponseMetaSwagger } from '../common/swagger/paginated-response.swagger';

export class PaymentOrderLineItemSwagger implements PaymentOrderLineItemContract {
  @ApiProperty({ description: '行项目 ID' })
  itemId!: string;

  @ApiPropertyOptional({ description: '商品主数据 ID', nullable: true })
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

export class OfflinePaymentInfoSwagger implements OfflinePaymentInfoContract {
  @ApiProperty({
    description: '线下支付方式',
    enum: Object.values(OfflinePaymentMethodEnum),
    example: OfflinePaymentMethodEnum.OTHER_PAID,
  })
  method!: OfflinePaymentInfoContract['method'];

  @ApiProperty({ description: '线下登记备注', example: '客户已转账，待核实' })
  remark!: string;

  @ApiPropertyOptional({
    description: '线下登记确认状态',
    enum: Object.values(OfflinePaymentVerifyStatusEnum),
    example: OfflinePaymentVerifyStatusEnum.PENDING,
    nullable: true,
  })
  offlineVerifyStatus!: OfflinePaymentInfoContract['offlineVerifyStatus'];

  @ApiProperty({ description: '确认状态文案', example: '待确认' })
  offlineVerifyStatusText!: string;

  @ApiProperty({ description: '提交时间', example: '2026-04-11T09:00:00.000Z' })
  submittedAt!: string;

  @ApiPropertyOptional({ description: '确认时间', example: '2026-04-11T10:00:00.000Z', nullable: true })
  verifiedAt?: string | null;
}

export class PaymentActionSwagger implements PaymentActionContract {
  @ApiProperty({ description: '是否允许继续当前未过期的第三方收银台支付尝试', example: true })
  canResume!: boolean;

  @ApiPropertyOptional({
    description: '当前支付尝试的继续支付地址；不可继续时为 null',
    example: 'https://cashier.example.com/pay/123',
    nullable: true,
  })
  resumeUrl!: string | null;

  @ApiProperty({ description: '是否允许重新发起在线支付', example: false })
  canInitiate!: boolean;

  @ApiPropertyOptional({
    description: '订单可发起支付的最大时间；以下单日期和租户支付有效期配置按自然日计算',
    example: '2026-05-06T12:35:00.000Z',
    nullable: true,
  })
  expiresAt!: string | null;
}

export class OfflinePaymentActionSwagger implements OfflinePaymentActionContract {
  @ApiProperty({ description: '是否允许提交新的线下支付登记', example: true })
  canSubmit!: boolean;

  @ApiPropertyOptional({
    description: '不允许线下登记时的原因；允许时为 null',
    example: '当前商户已暂停收款，请联系商户处理',
    nullable: true,
  })
  reason!: string | null;
}

export class PaymentOrderDetailResponseSwagger implements PaymentOrderDetailResponseContract {
  @ApiProperty({ description: '订单号', example: 'ERP20260410001' })
  orderNo!: string;

  @ApiProperty({ description: '商户名称', example: '深圳华强贸易有限公司' })
  merchant!: string;

  @ApiProperty({ description: '客户名称', example: '深圳华强贸易' })
  customer!: string;

  @ApiProperty({ description: '订单金额（元）', example: 198.5 })
  amount!: number;

  @ApiProperty({ description: '已收金额（元）', example: 100 })
  paidAmount!: number;

  @ApiProperty({ description: '订单摘要', example: '农夫山泉 550ml、康师傅冰红茶' })
  summary!: string;

  @ApiProperty({ description: '下单时间', example: '2026-04-10T12:00:00.000Z' })
  date!: string;

  @ApiProperty({
    description: '当前 H5 页面应展示的 H5 支付状态',
    enum: Object.values(PaymentOrderStatusEnum),
    example: PaymentOrderStatusEnum.UNPAID,
  })
  status!: PaymentOrderDetailResponseContract['status'];

  @ApiPropertyOptional({ description: '状态说明', example: '订单待支付' })
  statusMessage?: string;

  @ApiPropertyOptional({ description: '客服电话', example: '400-800-1234' })
  servicePhone?: string;

  @ApiPropertyOptional({
    description: '当前选择的支付方式',
    enum: Object.values(PaymentMethodEnum),
    example: PaymentMethodEnum.ONLINE,
    nullable: true,
  })
  selectedPaymentMethod!: PaymentOrderDetailResponseContract['selectedPaymentMethod'];

  @ApiPropertyOptional({ description: '线下支付信息', type: OfflinePaymentInfoSwagger, nullable: true })
  offlinePayment!: OfflinePaymentInfoSwagger | null;

  @ApiProperty({ description: '当前订单允许的在线支付动作', type: PaymentActionSwagger })
  paymentAction!: PaymentActionSwagger;

  @ApiProperty({ description: '当前订单允许的线下登记动作', type: OfflinePaymentActionSwagger })
  offlinePaymentAction!: OfflinePaymentActionSwagger;

  @ApiProperty({ description: '订单明细', type: [PaymentOrderLineItemSwagger] })
  items!: PaymentOrderLineItemSwagger[];
}

export class InitiatePaymentResponseSwagger implements InitiatePaymentResponseContract {
  @ApiProperty({ description: '收银台地址', example: 'https://cashier.example.com/pay/123' })
  cashierUrl!: string;

  @ApiProperty({ description: '业务订单 ID' })
  orderId!: string;

  @ApiProperty({ description: '服务端计算出的本次定额支付金额字符串', example: '198.50' })
  payableAmount!: string;
}

export class SubmitOfflinePaymentResponseSwagger implements SubmitOfflinePaymentResponseContract {
  @ApiProperty({ description: '订单号', example: 'ERP20260410001' })
  orderNo!: string;

  @ApiProperty({
    description: '更新后的 H5 支付状态',
    enum: Object.values(PaymentOrderStatusEnum),
    example: PaymentOrderStatusEnum.PENDING_VERIFICATION,
  })
  status!: SubmitOfflinePaymentResponseContract['status'];

  @ApiPropertyOptional({ description: '状态说明', example: '已提交线下登记，等待商户确认' })
  statusMessage?: string;

  @ApiPropertyOptional({
    description: '当前选择的支付方式',
    enum: Object.values(PaymentMethodEnum),
    example: PaymentMethodEnum.OTHER_PAID,
    nullable: true,
  })
  selectedPaymentMethod!: SubmitOfflinePaymentResponseContract['selectedPaymentMethod'];

  @ApiPropertyOptional({ description: '线下支付信息', type: OfflinePaymentInfoSwagger, nullable: true })
  offlinePayment!: OfflinePaymentInfoSwagger | null;
}

export class PaymentStatusResponseSwagger implements PaymentStatusResponseContract {
  @ApiProperty({ description: '订单号', example: 'ERP20260410001' })
  orderNo!: string;

  @ApiProperty({
    description: '当前 H5 页面应展示的 H5 支付状态，由订单主状态、已收金额与最新支付单状态综合推导',
    enum: Object.values(PaymentOrderStatusEnum),
    example: PaymentOrderStatusEnum.PAID,
  })
  status!: PaymentStatusResponseContract['status'];

  @ApiPropertyOptional({ description: '状态说明', example: '支付成功' })
  statusMessage?: string;

  @ApiPropertyOptional({ description: '已收金额（元）', example: 198.5 })
  paidAmount?: number;

  @ApiPropertyOptional({ description: '支付完成时间', example: '2026-04-11T10:00:00.000Z' })
  paidAt?: string;

  @ApiPropertyOptional({
    description: '最终支付方式',
    enum: Object.values(PaymentMethodEnum),
    example: PaymentMethodEnum.ONLINE,
  })
  selectedPaymentMethod?: PaymentStatusResponseContract['selectedPaymentMethod'];

  @ApiProperty({ description: '当前订单允许的在线支付动作', type: PaymentActionSwagger })
  paymentAction!: PaymentActionSwagger;

  @ApiProperty({ description: '当前订单允许的线下登记动作', type: OfflinePaymentActionSwagger })
  offlinePaymentAction!: OfflinePaymentActionSwagger;
}

export class CreateOfflinePaymentVerificationResponseSwagger implements CreateOfflinePaymentVerificationResponseContract {
  @ApiProperty({ description: '订单 ID' })
  orderId!: string;

  @ApiProperty({ description: '订单状态', enum: Object.values(OrderStatusEnum), example: OrderStatusEnum.PAID })
  orderStatus!: CreateOfflinePaymentVerificationResponseContract['orderStatus'];

  @ApiProperty({
    description: '支付状态',
    enum: Object.values(PaymentOrderStatusEnum),
    example: PaymentOrderStatusEnum.PAID,
  })
  paymentStatus!: CreateOfflinePaymentVerificationResponseContract['paymentStatus'];

  @ApiProperty({ description: '确认时间', example: '2026-04-11T10:00:00.000Z' })
  verifiedAt!: string;
}

export class TenantPaymentRecordItemSwagger implements TenantPaymentRecordItemContract {
  @ApiProperty({ description: '流水 ID' })
  id!: string;

  @ApiProperty({ description: '订单 ID' })
  orderId!: string;

  @ApiProperty({ description: '客户名称', example: '深圳华强贸易' })
  customer!: string;

  @ApiProperty({ description: '收款金额（元）', example: 198.5 })
  amount!: number;

  @ApiProperty({ description: '支付渠道', example: 'lakala' })
  channel!: string;

  @ApiProperty({ description: '手续费（元）', example: 0.6 })
  fee!: number;

  @ApiProperty({ description: '净额（元）', example: 197.9 })
  net!: number;

  @ApiProperty({
    description: '流水状态',
    enum: Object.values(PaymentRecordStatusEnum),
    example: PaymentRecordStatusEnum.SUCCESS,
  })
  status!: TenantPaymentRecordItemContract['status'];

  @ApiProperty({ description: '支付时间', example: '2026-04-11T10:00:00.000Z' })
  paidAt!: string;
}

export class AdminPaymentRecordItemSwagger implements AdminPaymentRecordItemContract {
  @ApiProperty({ description: '流水 ID' })
  id!: string;

  @ApiProperty({ description: '所属租户名称', example: '华南一区商户A' })
  tenant!: string;

  @ApiProperty({ description: '订单 ID' })
  orderId!: string;

  @ApiProperty({ description: '客户名称', example: '深圳华强贸易' })
  customer!: string;

  @ApiProperty({ description: '收款金额（元）', example: 198.5 })
  amount!: number;

  @ApiProperty({ description: '支付渠道', example: 'lakala' })
  channel!: string;

  @ApiProperty({ description: '手续费（元）', example: 0.6 })
  fee!: number;

  @ApiProperty({ description: '净额（元）', example: 197.9 })
  net!: number;

  @ApiProperty({ description: '时间字段', example: '2026-04-11T10:00:00.000Z' })
  time!: string;

  @ApiProperty({
    description: '流水状态',
    enum: Object.values(PaymentRecordStatusEnum),
    example: PaymentRecordStatusEnum.SUCCESS,
  })
  status!: AdminPaymentRecordItemContract['status'];
}

export class TenantPaymentListResponseSwagger extends PaginatedResponseMetaSwagger implements PaginatedResponse<TenantPaymentRecordItemContract> {
  @ApiProperty({ description: '流水列表', type: [TenantPaymentRecordItemSwagger] })
  list!: TenantPaymentRecordItemSwagger[];
}

export class AdminPaymentListResponseSwagger extends PaginatedResponseMetaSwagger implements PaginatedResponse<AdminPaymentRecordItemContract> {
  @ApiProperty({ description: '流水列表', type: [AdminPaymentRecordItemSwagger] })
  list!: AdminPaymentRecordItemSwagger[];
}

export class PaymentSummaryResponseSwagger implements PaymentSummaryResponseContract {
  @ApiProperty({ description: '总收款金额（元）', example: 12800 })
  totalAmount!: number;

  @ApiProperty({ description: '总手续费（元）', example: 38.5 })
  totalFee!: number;

  @ApiProperty({ description: '总净额（元）', example: 12761.5 })
  totalNet!: number;

  @ApiProperty({ description: '流水总数', example: 66 })
  totalCount!: number;

  @ApiProperty({ description: '异常流水数', example: 1 })
  abnormalCount!: number;
}
