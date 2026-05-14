import { Injectable } from '@nestjs/common';
import { type Prisma, OrderPayTypeEnum as PrismaOrderPayTypeEnum, PaymentRecordStatusEnum as PrismaPaymentRecordStatusEnum } from '@prisma/client';
import { OrderPayTypeEnum, OrderStatusEnum, type OrderPayType, type OrderStatus } from '@shou/types/enums';
import Decimal from 'decimal.js';
import { cut } from '../common/validators';
import { decimal, toPrismaDecimal } from '../common/money';
import { ID_CONFIG } from '../id-generator/id-generator.constants';
import { IdGeneratorService } from '../id-generator/id-generator.service';
import { fromPrismaOrderPayType, toPrismaOrderStatus } from './mapping/payment.mapper';

const APPLY_ORDER_PAID_MAX_RETRIES = 5;

@Injectable()
export class PaymentLedgerService {
  constructor(private readonly idGen: IdGeneratorService) {}

  // 创建一条已确认的支付流水，单独记录本次入账事实，不在这里累计订单汇总金额
  async createPaymentRecord(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      orderId: string;
      customer: string;
      amount: Decimal;
      channel: string;
      status: PrismaPaymentRecordStatusEnum;
      paidAt: Date;
      gatewayTradeNo?: string;
      fee?: Decimal;
      net?: Decimal;
    },
  ) {
    const paymentId = await this.idGen.nextDailyId(ID_CONFIG.PAYMENT.prefix, ID_CONFIG.PAYMENT.digits);
    const fee = input.fee ?? new Decimal(0);
    const net = input.net ?? input.amount;

    return tx.payment.create({
      data: {
        id: paymentId,
        tenantId: input.tenantId,
        orderId: input.orderId,
        customer: cut(input.customer, 100),
        amount: toPrismaDecimal(input.amount),
        channel: input.channel,
        fee: toPrismaDecimal(fee),
        net: toPrismaDecimal(net),
        status: input.status,
        paidAt: input.paidAt,
        gatewayTradeNo: input.gatewayTradeNo,
      },
    });
  }

  // 先写支付流水，再用统一的订单累计逻辑更新订单实收与订单状态
  async createPaymentRecordAndApplyOrder(
    tx: Prisma.TransactionClient,
    order: {
      id: string;
      tenantId: string;
      customer: string;
      totalAmount: Prisma.Decimal;
      paid: Prisma.Decimal;
      payType: PrismaOrderPayTypeEnum;
    },
    input: {
      amount: Decimal;
      channel: string;
      status: PrismaPaymentRecordStatusEnum;
      paidAt: Date;
      gatewayTradeNo?: string;
      fee?: Decimal;
      net?: Decimal;
    },
  ) {
    await this.createPaymentRecord(tx, {
      tenantId: order.tenantId,
      orderId: order.id,
      customer: order.customer,
      amount: input.amount,
      channel: input.channel,
      status: input.status,
      paidAt: input.paidAt,
      gatewayTradeNo: input.gatewayTradeNo,
      fee: input.fee,
      net: input.net,
    });

    return this.applyOrderPaidAmountWithRetry(tx, {
      orderId: order.id,
      delta: input.amount,
    });
  }

  /**
   * 基于调用方传入的订单快照累计实收金额
   *
   * 这个入口适合串行上下文或低并发场景
   * 高并发或可能并发入账的链路应优先走 applyOrderPaidAmountWithRetry，避免 read-modify-write 覆盖
   */
  async applyOrderPaidAmount(
    tx: Prisma.TransactionClient,
    order: {
      id: string;
      totalAmount: Prisma.Decimal;
      paid: Prisma.Decimal;
      payType: PrismaOrderPayTypeEnum;
    },
    delta: Decimal,
  ) {
    const newPaid = decimal(order.paid).plus(delta);
    const nextStatus = this.deriveOrderStatus(fromPrismaOrderPayType(order.payType), decimal(order.totalAmount), newPaid);

    return tx.order.update({
      where: { id: order.id },
      data: {
        paid: toPrismaDecimal(newPaid),
        status: toPrismaOrderStatus(nextStatus),
      },
    });
  }

  /**
   * 通过 compare-and-swap 重试方式累计订单实收金额与订单状态
   *
   * 每次都会先读取最新订单金额，再以 paid 旧值作为条件更新
   * 若更新失败说明期间有并发写入，会重新读取并重试，直到成功或达到重试上限
   */
  async applyOrderPaidAmountWithRetry(
    tx: Prisma.TransactionClient,
    input: {
      orderId: string;
      delta: Decimal;
    },
  ) {
    for (let attempt = 0; attempt < APPLY_ORDER_PAID_MAX_RETRIES; attempt += 1) {
      const currentOrder = await tx.order.findUnique({
        where: { id: input.orderId },
        select: {
          id: true,
          totalAmount: true,
          paid: true,
          payType: true,
        },
      });

      if (!currentOrder) {
        throw new Error(`订单不存在: ${input.orderId}`);
      }

      const newPaid = decimal(currentOrder.paid).plus(input.delta);
      const nextStatus = this.deriveOrderStatus(fromPrismaOrderPayType(currentOrder.payType), decimal(currentOrder.totalAmount), newPaid);

      const updated = await tx.order.updateMany({
        where: {
          id: currentOrder.id,
          paid: currentOrder.paid,
        },
        data: {
          paid: toPrismaDecimal(newPaid),
          status: toPrismaOrderStatus(nextStatus),
        },
      });

      if (updated.count === 1) {
        return tx.order.findUniqueOrThrow({
          where: { id: currentOrder.id },
        });
      }
    }

    throw new Error(`订单实收金额更新冲突，请重试: ${input.orderId}`);
  }

  // 返回订单当前还剩多少金额允许继续支付或核销
  getRemainingAmount(order: { totalAmount: Prisma.Decimal; paid: Prisma.Decimal }): Decimal {
    return decimal(order.totalAmount).minus(decimal(order.paid));
  }

  // 根据累计已收金额推导订单聚合状态，不区分线上回调还是线下核销来源
  private deriveOrderStatus(payType: OrderPayType, amount: Decimal, paid: Decimal): OrderStatus {
    if (amount.gt(0) && paid.gte(amount)) return OrderStatusEnum.PAID;
    if (paid.gt(0)) return OrderStatusEnum.PARTIAL;
    if (payType === OrderPayTypeEnum.CREDIT) return OrderStatusEnum.CREDIT;
    return OrderStatusEnum.PENDING;
  }
}
