import { PaymentOrderStatusEnum, Prisma, OrderStatusEnum as PrismaOrderStatusEnum } from '@prisma/client';
import type { OrderLineItem } from '@shou/types/contracts';
import Decimal from 'decimal.js';
import { toDecimal, toMoney, toPrismaDecimal } from '../common/money';
import { generateQrCodeToken } from '../common/tokens';
import { cut, normalizeNullableText, parseLocalDateTime } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import type { PreparedImportOrder } from './import.normalizer';
import { toPrismaOrderPayType } from './mapping/import.mapper';

/**
 * 将预检通过的导入订单转换为 Prisma 新建订单输入
 * 负责补齐租户关联、二维码、订单状态和商品行明细落库结构
 */
export function toImportOrderCreateInput(tenantId: string, order: PreparedImportOrder): Prisma.OrderCreateInput {
  const totalAmount = toMoney(order.totalAmount, 'totalAmount', true);

  return {
    tenantId,
    sourceOrderNo: order.sourceOrderNo,
    groupKey: order.groupKey,
    mappingTemplateId: BigInt(order.mappingTemplateId as string),
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
    orderTime: parseImportOrderTime(order.orderTime),
    voided: false,
    lineItems: {
      create: order.lineItems.map((item) => toOrderLineItemCreateInput(item)),
    },
  } as unknown as Prisma.OrderCreateInput;
}

/**
 * 将预检通过的导入订单转换为 Prisma 覆盖订单输入
 * 覆盖时会重置收款状态、作废状态，并删除后重建商品行明细
 */
export function toImportOrderUpdateInput(order: PreparedImportOrder): Prisma.OrderUpdateInput {
  const totalAmount = toMoney(order.totalAmount, 'totalAmount', true);

  return {
    groupKey: order.groupKey,
    mappingTemplateId: BigInt(order.mappingTemplateId as string),
    customer: cut(order.customer, 100),
    customerPhone: normalizeNullableText(order.customerPhone, 30),
    customerAddress: cut(order.customerAddress, 255),
    totalAmount: toPrismaDecimal(totalAmount),
    paid: toPrismaDecimal(new Decimal(0)),
    customerFieldValues: order.customerFieldValues as unknown as Prisma.InputJsonValue,
    status: resolveImportedOrderStatus(totalAmount),
    payType: toPrismaOrderPayType(order.payType),
    orderTime: parseImportOrderTime(order.orderTime),
    voided: false,
    voidReason: null,
    voidedAt: null,
    lineItems: {
      deleteMany: {},
      create: order.lineItems.map((item) => toOrderLineItemCreateInput(item)),
    },
  } as unknown as Prisma.OrderUpdateInput;
}

/**
 * 按租户和源订单号查找已有导入订单
 * 用于正式导入时执行跳过、覆盖等冲突策略判断
 */
export async function findExistingImportOrder(client: Prisma.TransactionClient | PrismaService, tenantId: string, sourceOrderNo: string) {
  return client.order.findFirst({
    where: { tenantId, sourceOrderNo, deletedAt: null },
    select: { id: true },
  });
}

/**
 * 判断订单是否已经进入收款或支付单流程
 * 已有关联流水时禁止覆盖，避免导入覆盖破坏账务一致性
 */
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

/**
 * 根据导入订单金额推导初始订单状态
 * 0 元订单视为无需收款，直接进入已结清状态
 */
function resolveImportedOrderStatus(totalAmount: Decimal): PrismaOrderStatusEnum {
  return totalAmount.isZero() ? PrismaOrderStatusEnum.PAID : PrismaOrderStatusEnum.PENDING;
}

/** 将导入预检产物转成 Prisma timestamp 载体，预检已保证格式合法 */
function parseImportOrderTime(value: string): Date {
  const parsed = parseLocalDateTime(value);
  if (!parsed) {
    throw new Error(`导入订单下单时间格式异常：${value}`);
  }

  return parsed;
}

/**
 * 将导入商品行转换为 Prisma 明细行创建输入
 * 保留包装规格和行级自定义字段，供订单详情和打印配置后续使用
 */
function toOrderLineItemCreateInput(item: OrderLineItem): Prisma.OrderItemCreateWithoutOrderInput {
  return {
    skuId: item.skuId ?? null,
    skuName: cut(item.skuName, 200),
    skuSpec: item.skuSpec ? cut(item.skuSpec, 100) : undefined,
    unit: cut(item.unit, 20),
    quantity: toPrismaDecimal(toDecimal(item.quantity, 'quantity', 3, true)),
    packSpec: item.packSpec ? cut(item.packSpec, 50) : undefined,
    unitPrice: toPrismaDecimal(toMoney(item.unitPrice, 'unitPrice', true)),
    lineAmount: toPrismaDecimal(toMoney(item.lineAmount, 'lineAmount', true)),
    customerFieldValues: item.customerFieldValues as unknown as Prisma.InputJsonValue,
  };
}
