import {
  Prisma,
  OrderCreditTypeEnum as PrismaOrderCreditTypeEnum,
  OrderPayTypeEnum as PrismaOrderPayTypeEnum,
  OrderStatusEnum as PrismaOrderStatusEnum,
  PaymentMethodEnum as PrismaPaymentMethodEnum,
  OfflinePaymentVerifyStatusEnum as PrismaOfflinePaymentVerifyStatusEnum,
} from '@prisma/client';
import type { AdminOrderItem, OfflinePaymentInfo, OrderLineItem, TenantOrderItem, TenantOrderListItem } from '@shou/types/contracts';
import { CreditTypeEnum, type CreditType } from '@shou/types/enums';
import dayjs from 'dayjs';
import { toDecimal, toMoney, toMoneyNumber, toDecimalNumber, toPrismaDecimal } from '../../common/money';
import { formatDateTime } from '../../common/validators';
import { resolveCreditDays } from '../order-credit.domain';
import { fromPrismaOfflinePaymentVerifyStatus, fromPrismaPaymentMethod, offlineVerifyStatusText } from '../../payment/mapping/payment.mapper';
import { fromPrismaOrderCreditType, fromPrismaOrderPayType, fromPrismaOrderStatus } from './order-enum.mapper';

export function toLineItemCreateInput(item: OrderLineItem): Prisma.OrderItemCreateWithoutOrderInput {
  return {
    skuId: item.skuId ?? null,
    skuName: item.skuName,
    skuSpec: item.skuSpec,
    unit: item.unit,
    quantity: toPrismaDecimal(toDecimal(item.quantity, 'quantity', 3)),
    packSpec: item.packSpec,
    unitPrice: toPrismaDecimal(toMoney(item.unitPrice, 'unitPrice', true)),
    lineAmount: toPrismaDecimal(toMoney(item.lineAmount, 'lineAmount', true)),
    customerFieldValues: item.customerFieldValues as unknown as Prisma.InputJsonValue,
  };
}

export function toCustomerFieldValues(value: Prisma.JsonValue | null): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== null && item !== undefined)
      .map(([key, item]) => [key, String(item)]),
  );
}

interface OrderRowBase {
  id: string;
  sourceOrderNo: string | null;
  groupKey: string | null;
  mappingTemplateId: bigint | null;
  qrCodeToken: string;
  customer: string;
  customerPhone?: string | null;
  customerAddress?: string | null;
  totalAmount: Prisma.Decimal;
  paid: Prisma.Decimal;
  customerFieldValues?: Prisma.JsonValue | null;
  status: PrismaOrderStatusEnum;
  payType: PrismaOrderPayTypeEnum;
  creditType?: PrismaOrderCreditTypeEnum | string | null;
  creditDays?: number | null;
  creditDueDate?: Date | null;
  prints: number;
  lastPrintedAt: Date | null;
  printFailedCount: number;
  lastFailedAt: Date | null;
  orderTime: Date;
  voided: boolean;
  voidReason: string | null;
  voidedAt: Date | null;
  paymentOrders?: Array<{
    paymentMethod: PrismaPaymentMethodEnum | null;
    offlineRemark: string | null;
    offlineVerifyStatus: PrismaOfflinePaymentVerifyStatusEnum | null;
    offlineSubmittedAt: Date | null;
    offlineVerifiedAt: Date | null;
  }>;
  lineItems: Array<{
    id: bigint;
    skuId: string | null;
    skuName: string;
    skuSpec: string | null;
    unit: string;
    quantity: Prisma.Decimal;
    packSpec: string | null;
    unitPrice: Prisma.Decimal;
    lineAmount: Prisma.Decimal;
    customerFieldValues: Prisma.JsonValue | null;
  }>;
}

type OrderOfflinePaymentRow = NonNullable<OrderRowBase['paymentOrders']>[number];

function toOfflinePaymentInfo(paymentOrder: OrderOfflinePaymentRow | null): OfflinePaymentInfo | null {
  if (!paymentOrder?.offlineSubmittedAt || !paymentOrder.paymentMethod) {
    return null;
  }

  const method = fromPrismaPaymentMethod(paymentOrder.paymentMethod);
  if (method !== 'cash' && method !== 'other_paid') {
    return null;
  }

  return {
    method,
    remark: paymentOrder.offlineRemark ?? '',
    offlineVerifyStatus: paymentOrder.offlineVerifyStatus ? fromPrismaOfflinePaymentVerifyStatus(paymentOrder.offlineVerifyStatus) : null,
    offlineVerifyStatusText: offlineVerifyStatusText(paymentOrder.offlineVerifyStatus),
    submittedAt: paymentOrder.offlineSubmittedAt.toISOString(),
    verifiedAt: paymentOrder.offlineVerifiedAt?.toISOString() ?? null,
  };
}

export function toTenantOrderListItem(order: Omit<OrderRowBase, 'lineItems'>): TenantOrderListItem {
  return {
    id: order.id,
    sourceOrderNo: order.sourceOrderNo ?? undefined,
    groupKey: order.groupKey ?? undefined,
    mappingTemplateId: order.mappingTemplateId != null ? String(order.mappingTemplateId) : undefined,
    qrCodeToken: order.qrCodeToken,
    customer: order.customer,
    customerPhone: order.customerPhone ?? null,
    customerAddress: order.customerAddress ?? '',
    totalAmount: toMoneyNumber(order.totalAmount),
    paid: toMoneyNumber(order.paid),
    offlinePayment: toOfflinePaymentInfo(order.paymentOrders?.[0] ?? null),
    status: fromPrismaOrderStatus(order.status),
    payType: fromPrismaOrderPayType(order.payType),
    ...toOrderCreditFields(order),
    prints: order.prints,
    lastPrintedAt: formatDateTime(order.lastPrintedAt),
    printFailedCount: order.printFailedCount,
    lastFailedAt: formatDateTime(order.lastFailedAt),
    orderTime: formatDateTime(order.orderTime),
    customerFieldValues: toCustomerFieldValues(order.customerFieldValues ?? null),
    voided: order.voided,
    voidReason: order.voidReason ?? undefined,
    voidedAt: formatDateTime(order.voidedAt),
  };
}

export function toTenantOrder(order: OrderRowBase): TenantOrderItem {
  return {
    id: order.id,
    sourceOrderNo: order.sourceOrderNo ?? undefined,
    groupKey: order.groupKey ?? undefined,
    mappingTemplateId: order.mappingTemplateId != null ? String(order.mappingTemplateId) : undefined,
    qrCodeToken: order.qrCodeToken,
    customer: order.customer,
    customerPhone: order.customerPhone ?? null,
    customerAddress: order.customerAddress ?? '',
    totalAmount: toMoneyNumber(order.totalAmount),
    paid: toMoneyNumber(order.paid),
    offlinePayment: toOfflinePaymentInfo(order.paymentOrders?.[0] ?? null),
    status: fromPrismaOrderStatus(order.status),
    payType: fromPrismaOrderPayType(order.payType),
    ...toOrderCreditFields(order),
    prints: order.prints,
    lastPrintedAt: formatDateTime(order.lastPrintedAt),
    printFailedCount: order.printFailedCount,
    lastFailedAt: formatDateTime(order.lastFailedAt),
    orderTime: formatDateTime(order.orderTime),
    lineItems: order.lineItems.map((item) => ({
      itemId: String(item.id),
      skuId: item.skuId,
      skuName: item.skuName,
      skuSpec: item.skuSpec ?? undefined,
      unit: item.unit,
      quantity: toDecimalNumber(item.quantity, 3),
      packSpec: item.packSpec ?? undefined,
      unitPrice: toMoneyNumber(item.unitPrice),
      lineAmount: toMoneyNumber(item.lineAmount),
      customerFieldValues: toCustomerFieldValues(item.customerFieldValues ?? null),
    })),
    customerFieldValues: toCustomerFieldValues(order.customerFieldValues ?? null),
    voided: order.voided,
    voidReason: order.voidReason ?? undefined,
    voidedAt: formatDateTime(order.voidedAt),
  };
}

function toOrderCreditFields(
  order: Pick<OrderRowBase, 'payType' | 'orderTime' | 'creditType' | 'creditDays' | 'creditDueDate'>,
): Pick<TenantOrderItem, 'creditType' | 'creditDays' | 'dueDate'> {
  return resolveOrderCreditFields(order);
}

function resolveOrderCreditFields(order: {
  payType: PrismaOrderPayTypeEnum;
  orderTime: Date;
  creditType?: PrismaOrderCreditTypeEnum | string | null;
  creditDays?: number | null;
  creditDueDate?: Date | null;
}): { creditType: CreditType | null; creditDays: number | null; dueDate: string | null } {
  if (order.payType !== PrismaOrderPayTypeEnum.CREDIT) {
    return { creditType: null, creditDays: null, dueDate: null };
  }

  const creditType = fromPrismaOrderCreditType(order.creditType) ?? CreditTypeEnum.PERIOD;
  const creditDays = order.creditDays ?? resolveCreditDays(creditType) ?? 0;
  const dueDate = order.creditDueDate ?? dayjs(order.orderTime).add(creditDays, 'day').toDate();

  return {
    creditType,
    creditDays,
    dueDate: formatDateTime(dueDate),
  };
}

export function toAdminOrder(order: OrderRowBase & { tenant: { name: string } }): AdminOrderItem {
  return {
    id: order.id,
    tenant: order.tenant.name,
    sourceOrderNo: order.sourceOrderNo ?? undefined,
    groupKey: order.groupKey ?? undefined,
    mappingTemplateId: order.mappingTemplateId != null ? String(order.mappingTemplateId) : undefined,
    qrCodeToken: order.qrCodeToken,
    customer: order.customer,
    customerPhone: order.customerPhone ?? null,
    customerAddress: order.customerAddress ?? '',
    totalAmount: toMoneyNumber(order.totalAmount),
    lineItems: order.lineItems.map((item) => ({
      itemId: String(item.id),
      skuId: item.skuId,
      skuName: item.skuName,
      skuSpec: item.skuSpec ?? undefined,
      unit: item.unit,
      quantity: toDecimalNumber(item.quantity, 3),
      packSpec: item.packSpec ?? undefined,
      unitPrice: toMoneyNumber(item.unitPrice),
      lineAmount: toMoneyNumber(item.lineAmount),
      customerFieldValues: toCustomerFieldValues(item.customerFieldValues ?? null),
    })),
    customerFieldValues: toCustomerFieldValues(order.customerFieldValues ?? null),
    paid: toMoneyNumber(order.paid),
    status: fromPrismaOrderStatus(order.status),
    payType: fromPrismaOrderPayType(order.payType),
    ...toOrderCreditFields(order),
    orderTime: formatDateTime(order.orderTime),
    voided: order.voided,
    voidReason: order.voidReason ?? undefined,
    voidedAt: formatDateTime(order.voidedAt),
  };
}
