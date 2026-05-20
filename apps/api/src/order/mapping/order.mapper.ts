import { Prisma, OrderPayTypeEnum as PrismaOrderPayTypeEnum, OrderStatusEnum as PrismaOrderStatusEnum } from '@prisma/client';
import type { AdminOrderItem, CreditOrderItem, OrderLineItem, TenantOrderItem } from '@shou/types/contracts';
import dayjs from 'dayjs';
import { toDecimal, toMoney, toMoneyNumber, toDecimalNumber, toPrismaDecimal } from '../../common/money';
import { formatDateTime } from '../../common/validators';
import { resolveCreditOrderStatus } from '../order.domain';
import { fromPrismaOrderPayType, fromPrismaOrderStatus } from './order-enum.mapper';

export function toLineItemCreateInput(item: OrderLineItem): Prisma.OrderItemCreateWithoutOrderInput {
  return {
    skuId: item.skuId ?? null,
    skuName: item.skuName,
    skuSpec: item.skuSpec,
    unit: item.unit,
    quantity: toPrismaDecimal(toDecimal(item.quantity, 'quantity', 3)),
    unitPrice: toPrismaDecimal(toMoney(item.unitPrice, 'unitPrice', true)),
    lineAmount: toPrismaDecimal(toMoney(item.lineAmount, 'lineAmount', true)),
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
  prints: number;
  lastPrintedAt: Date | null;
  printFailedCount: number;
  lastFailedAt: Date | null;
  orderTime: Date;
  voided: boolean;
  voidReason: string | null;
  voidedAt: Date | null;
  lineItems: Array<{
    id: bigint;
    skuId: string | null;
    skuName: string;
    skuSpec: string | null;
    unit: string;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    lineAmount: Prisma.Decimal;
  }>;
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
    status: fromPrismaOrderStatus(order.status),
    payType: fromPrismaOrderPayType(order.payType),
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
      unitPrice: toMoneyNumber(item.unitPrice),
      lineAmount: toMoneyNumber(item.lineAmount),
    })),
    customerFieldValues: toCustomerFieldValues(order.customerFieldValues ?? null),
    voided: order.voided,
    voidReason: order.voidReason ?? undefined,
    voidedAt: formatDateTime(order.voidedAt),
  };
}

export function toCreditOrderItem(order: {
  id: string;
  customer: string;
  totalAmount: Prisma.Decimal;
  orderTime: Date;
  creditDays: number | null;
  creditDueDate: Date | null;
}): CreditOrderItem {
  const dueDate =
    order.creditDueDate ??
    dayjs(order.orderTime)
      .add(order.creditDays ?? 0, 'day')
      .toDate();
  return {
    id: order.id,
    customer: order.customer,
    amount: toMoneyNumber(order.totalAmount),
    date: formatDateTime(order.orderTime),
    creditDays: order.creditDays ?? 0,
    dueDate: formatDateTime(dueDate),
    creditStatus: resolveCreditOrderStatus(dueDate),
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
      unitPrice: toMoneyNumber(item.unitPrice),
      lineAmount: toMoneyNumber(item.lineAmount),
    })),
    customerFieldValues: toCustomerFieldValues(order.customerFieldValues ?? null),
    paid: toMoneyNumber(order.paid),
    status: fromPrismaOrderStatus(order.status),
    payType: fromPrismaOrderPayType(order.payType),
    orderTime: formatDateTime(order.orderTime),
    voided: order.voided,
    voidReason: order.voidReason ?? undefined,
    voidedAt: formatDateTime(order.voidedAt),
  };
}
