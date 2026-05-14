import { PaymentOrderStatusEnum, Prisma, OrderStatusEnum as PrismaOrderStatusEnum } from '@prisma/client';
import type { OrderLineItem } from '@shou/types/contracts';
import Decimal from 'decimal.js';
import { toDecimal, toMoney, toPrismaDecimal } from '../common/money';
import { generateQrCodeToken } from '../common/tokens';
import { cut, normalizeNullableText } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import type { PreparedImportOrder } from './import.normalizer';
import { toPrismaOrderPayType } from './mapping/import.mapper';

export function toImportOrderCreateInput(tenantId: string, order: PreparedImportOrder): Prisma.OrderCreateInput {
  const totalAmount = toMoney(order.totalAmount, 'totalAmount', true);

  return {
    tenant: { connect: { id: tenantId } },
    sourceOrderNo: order.sourceOrderNo,
    groupKey: order.groupKey,
    mappingTemplate: { connect: { id: BigInt(order.mappingTemplateId as string) } },
    qrCodeToken: generateQrCodeToken(),
    customer: cut(order.customer, 100),
    customerPhone: normalizeNullableText(order.customerPhone, 30),
    customerAddress: cut(order.customerAddress, 255),
    totalAmount: toPrismaDecimal(totalAmount),
    paid: toPrismaDecimal(new Decimal(0)),
    customerFieldValues: order.customerFieldValues as unknown as Prisma.InputJsonValue,
    status: resolveImportedOrderStatus(totalAmount),
    payType: toPrismaOrderPayType(order.payType),
    prints: 0,
    orderTime: new Date(order.orderTime),
    voided: false,
    lineItems: {
      create: order.lineItems.map((item) => toOrderLineItemCreateInput(item)),
    },
  } as unknown as Prisma.OrderCreateInput;
}

export function toImportOrderUpdateInput(order: PreparedImportOrder): Prisma.OrderUpdateInput {
  const totalAmount = toMoney(order.totalAmount, 'totalAmount', true);

  return {
    groupKey: order.groupKey,
    mappingTemplate: { connect: { id: BigInt(order.mappingTemplateId as string) } },
    customer: cut(order.customer, 100),
    customerPhone: normalizeNullableText(order.customerPhone, 30),
    customerAddress: cut(order.customerAddress, 255),
    totalAmount: toPrismaDecimal(totalAmount),
    paid: toPrismaDecimal(new Decimal(0)),
    customerFieldValues: order.customerFieldValues as unknown as Prisma.InputJsonValue,
    status: resolveImportedOrderStatus(totalAmount),
    payType: toPrismaOrderPayType(order.payType),
    orderTime: new Date(order.orderTime),
    voided: false,
    voidReason: null,
    voidedAt: null,
    lineItems: {
      deleteMany: {},
      create: order.lineItems.map((item) => toOrderLineItemCreateInput(item)),
    },
  } as unknown as Prisma.OrderUpdateInput;
}

export async function findExistingImportOrder(client: Prisma.TransactionClient | PrismaService, tenantId: string, sourceOrderNo: string) {
  return client.order.findUnique({
    where: { tenantId_sourceOrderNo: { tenantId, sourceOrderNo } },
    select: { id: true },
  });
}

export async function hasSettledImportOrderFlow(client: Prisma.TransactionClient | PrismaService, orderId: string): Promise<boolean> {
  const [payments, paymentOrders] = await Promise.all([
    client.payment.count({ where: { orderId } }),
    client.paymentOrder.count({
      where: {
        orderId,
        status: {
          in: [PaymentOrderStatusEnum.PAYING, PaymentOrderStatusEnum.PENDING_VERIFICATION, PaymentOrderStatusEnum.PAID],
        },
      },
    }),
  ]);

  return payments > 0 || paymentOrders > 0;
}

function resolveImportedOrderStatus(totalAmount: Decimal): PrismaOrderStatusEnum {
  return totalAmount.isZero() ? PrismaOrderStatusEnum.PAID : PrismaOrderStatusEnum.PENDING;
}

function toOrderLineItemCreateInput(item: OrderLineItem): Prisma.OrderItemCreateWithoutOrderInput {
  return {
    skuId: item.skuId ?? null,
    skuName: cut(item.skuName, 200),
    skuSpec: item.skuSpec ? cut(item.skuSpec, 100) : undefined,
    unit: cut(item.unit, 20),
    quantity: toPrismaDecimal(toDecimal(item.quantity, 'quantity', 3, true)),
    unitPrice: toPrismaDecimal(toMoney(item.unitPrice, 'unitPrice', true)),
    lineAmount: toPrismaDecimal(toMoney(item.lineAmount, 'lineAmount', true)),
  };
}
