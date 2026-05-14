import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OrderLineItem } from '@shou/types/contracts';
import { PaymentOrderStatusEnum } from '@shou/types/enums';
import Decimal from 'decimal.js';
import { toDecimal, toDecimalNumber, toMoney, toMoneyNumber } from '../common/money';
import { cut, normalizeText } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import { toPrismaPaymentOrderStatus } from '../payment/mapping/payment.mapper';

const SETTLED_ORDER_FLOW_PAYMENT_STATUSES = [
  PaymentOrderStatusEnum.PAYING,
  PaymentOrderStatusEnum.PENDING_VERIFICATION,
  PaymentOrderStatusEnum.PAID,
].map(toPrismaPaymentOrderStatus);

export async function hasSettledOrderFlow(client: Prisma.TransactionClient | PrismaService, orderId: string): Promise<boolean> {
  const [payments, paymentOrders] = await Promise.all([
    client.payment.count({ where: { orderId } }),
    client.paymentOrder.count({
      where: {
        orderId,
        status: {
          in: SETTLED_ORDER_FLOW_PAYMENT_STATUSES,
        },
      },
    }),
  ]);

  return payments > 0 || paymentOrders > 0;
}

export function normalizeOrderLineItem(item: OrderLineItem): OrderLineItem {
  const quantity = toDecimal(item.quantity, 'quantity', 3);
  const unitPrice = toMoney(item.unitPrice, 'unitPrice', true);
  const lineAmount = toMoney(item.lineAmount, 'lineAmount', true);
  const expected = quantity.mul(unitPrice).toDecimalPlaces(2);

  if (!expected.equals(lineAmount)) {
    throw new BadRequestException('lineAmount 必须等于 quantity * unitPrice');
  }

  return {
    itemId: item.itemId,
    skuId: item.skuId ?? null,
    skuName: normalizeText(item.skuName, 'skuName', 200),
    skuSpec: item.skuSpec?.trim() ? cut(item.skuSpec.trim(), 100) : undefined,
    unit: normalizeText(item.unit, 'unit', 20),
    quantity: toDecimalNumber(quantity, 3),
    unitPrice: toMoneyNumber(unitPrice),
    lineAmount: toMoneyNumber(lineAmount),
  };
}

export function sumOrderLineItemAmount(lineItems: OrderLineItem[]): Decimal {
  return lineItems.reduce((sum, item) => sum.plus(toMoney(item.lineAmount, 'lineAmount', true)), new Decimal(0));
}
