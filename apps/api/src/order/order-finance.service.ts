import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  AuditResultEnum as PrismaAuditResultEnum,
  AuditTargetTypeEnum as PrismaAuditTargetTypeEnum,
  OrderPayTypeEnum as PrismaOrderPayTypeEnum,
  OrderReminderStatusEnum as PrismaOrderReminderStatusEnum,
  PaymentOrderStatusEnum as PrismaPaymentOrderStatusEnum,
  PaymentRecordStatusEnum as PrismaPaymentRecordStatusEnum,
} from '@prisma/client';

import type { PaginatedResponse } from '@shou/types/common';

import type {
  CreateOrderReceiptRequest,
  CreateOrderReceiptResponse,
  CreateOrderReminderRequest,
  CreateOrderReminderResponse,
  CreditOrderItem,
} from '@shou/types/contracts';
import { PaymentOrderStatusEnum, type OrderSearchStatus } from '@shou/types/enums';

import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { toMoney, toMoneyNumber } from '../common/money';
import { cut, normalizePage, normalizePageSize } from '../common/validators';
import { ID_CONFIG } from '../id-generator/id-generator.constants';
import { IdGeneratorService } from '../id-generator/id-generator.service';
import { toPaymentDomainExpirableSnapshot, toPrismaPaymentOrderUpdateData } from '../payment/mapping/payment.mapper';
import { PaymentLedgerService } from '../payment/payment-ledger.service';
import { PaymentWindowService } from '../payment/payment-window.service';
import { buildExpirePayingPaymentOrderTransition, shouldExpirePayingPaymentOrder } from '../payment/payment.domain';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { fromPrismaOrderStatus } from './mapping/order-enum.mapper';
import { toCreditOrderItem } from './mapping/order.mapper';
import { getTenantCreditRemindDays } from './order-settings.query';
import { buildOrderSearchStatusWhere } from './order-status.query';
import { getOrderActorName, getOrderTenantId, normalizeReminderChannels } from './order.shared';

@Injectable()
export class OrderFinanceService {
  private readonly logger = new Logger(OrderFinanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly idGen: IdGeneratorService,
    private readonly redis: RedisService,
    private readonly ledgerService: PaymentLedgerService,
    private readonly paymentWindowService: PaymentWindowService,
  ) {}

  // 为订单创建催款提醒记录，并同步写入审计日志
  async createReminder(currentUser: JwtPayload, orderId: string, request: CreateOrderReminderRequest): Promise<CreateOrderReminderResponse> {
    const tenantId = getOrderTenantId(currentUser);
    const channels = normalizeReminderChannels(request.channels);
    const actor = await getOrderActorName(this.prisma, currentUser.userId);

    await this.prisma.$transaction(async (tx) => {
      const count = await tx.order.count({
        where: { id: orderId, tenantId, deletedAt: null },
      });
      if (count === 0) {
        throw new NotFoundException('订单不存在');
      }

      const reminderId = await this.idGen.nextDailyId(ID_CONFIG.ORDER_REMINDER.prefix, ID_CONFIG.ORDER_REMINDER.digits);
      await tx.orderReminder.create({
        data: {
          id: reminderId,
          tenantId,
          orderId,
          operatorId: currentUser.userId,
          channels,
          status: PrismaOrderReminderStatusEnum.SENT,
          sentAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          actor,
          action: '创建催款提醒记录',
          target: orderId,
          targetType: PrismaAuditTargetTypeEnum.TENANT,
          tenantId,
          result: PrismaAuditResultEnum.SUCCESS,
        },
      });
    });

    return {
      sent: true,
      channels,
    };
  }

  // 返回租户下未删除未作废的账期订单列表，可按订单搜索状态筛选
  async getCreditOrders(
    currentUser: JwtPayload,
    page?: number,
    pageSize?: number,
    status?: OrderSearchStatus,
  ): Promise<PaginatedResponse<CreditOrderItem>> {
    const tenantId = getOrderTenantId(currentUser);
    const resolvedPage = normalizePage(page);
    const resolvedPageSize = normalizePageSize(pageSize);
    const qrCodeExpiryDays = await this.paymentWindowService.getTenantQrCodeExpiryDays(tenantId);
    const statusWhere = buildOrderSearchStatusWhere(status, { tenantPaymentWindows: [{ tenantId, qrCodeExpiryDays }] });
    const where: Prisma.OrderWhereInput = {
      tenantId,
      deletedAt: null,
      voided: false,
      payType: PrismaOrderPayTypeEnum.CREDIT,
      ...(statusWhere ? { AND: [statusWhere] } : {}),
    };

    const remindDays = await getTenantCreditRemindDays(this.prisma, tenantId);

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: [{ creditDueDate: 'asc' }, { orderTime: 'asc' }],
        skip: (resolvedPage - 1) * resolvedPageSize,
        take: resolvedPageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      list: orders.map((order) => toCreditOrderItem(order, remindDays)),
      total,
      page: resolvedPage,
      pageSize: resolvedPageSize,
    };
  }

  /**
   * 为租户后台财务创建一条内部收款记录
   *
   * 这里只处理后台确认的已收事实，不向 H5/public 暴露部分付款能力
   * 若订单仍存在支付中的在线支付单或待确认线下登记支付单，会直接拒绝本次登记
   */
  async createReceipt(currentUser: JwtPayload, orderId: string, request: CreateOrderReceiptRequest): Promise<CreateOrderReceiptResponse> {
    const tenantId = getOrderTenantId(currentUser);
    const actor = await getOrderActorName(this.prisma, currentUser.userId);

    const idempotencyKey = request.idempotencyKey?.trim();
    if (idempotencyKey) {
      const existingPayment = await this.prisma.payment.findFirst({
        where: { tenantId, orderId, gatewayTradeNo: `receipt_${idempotencyKey}` },
      });
      if (existingPayment) {
        const existingOrder = await this.prisma.order.findUnique({
          where: { id: orderId },
        });
        if (!existingOrder) throw new NotFoundException('订单不存在');
        return {
          orderId: existingOrder.id,
          status: fromPrismaOrderStatus(existingOrder.status),
          paid: toMoneyNumber(existingOrder.paid),
        };
      }
    }

    const lockKey = `order:receipt:${orderId}`;
    const lockValue = await this.redis.acquireLock(lockKey, 10);
    if (!lockValue) {
      throw new ConflictException('当前订单的内部收款操作正在进行中，请稍后重试');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: orderId, tenantId, deletedAt: null },
        });

        if (!order) {
          throw new NotFoundException('订单不存在');
        }
        if (order.voided) {
          throw new ConflictException('已作废订单不允许登记内部收款');
        }

        await this.ensureNoBlockingPaymentOrder(tx, order.id, tenantId);

        const remaining = this.ledgerService.getRemainingAmount(order);
        if (remaining.lte(0)) {
          throw new ConflictException('订单已完成收款，无需重复登记内部收款');
        }

        const receiptAmount = request.amount !== undefined ? toMoney(request.amount, 'amount') : remaining;
        if (receiptAmount.lte(0) || receiptAmount.gt(remaining)) {
          throw new BadRequestException(`内部收款金额必须在 0.01 到 ${remaining.toFixed(2)} 之间`);
        }

        const paidAt = new Date();
        const updated = await this.ledgerService.createPaymentRecordAndApplyOrder(tx, order, {
          amount: receiptAmount,
          channel: 'manual_receipt',
          status: PrismaPaymentRecordStatusEnum.SUCCESS,
          paidAt,
          gatewayTradeNo: idempotencyKey ? `receipt_${idempotencyKey}` : undefined,
        });

        await tx.auditLog.create({
          data: {
            actor,
            action: request.remark?.trim()
              ? `创建内部收款记录 ${receiptAmount.toFixed(2)} 元 ${cut(request.remark.trim(), 50)}`
              : `创建内部收款记录 ${receiptAmount.toFixed(2)} 元`,
            target: order.id,
            targetType: PrismaAuditTargetTypeEnum.TENANT,
            tenantId,
            result: PrismaAuditResultEnum.SUCCESS,
          },
        });

        this.logger.log(
          `[AUDIT] 内部收款成功 - 租户: ${tenantId}, 订单: ${order.id}, 收款金额: ${receiptAmount.toFixed(2)}, 新已付: ${updated.paid.toString()}, 状态: ${updated.status}, 操作人: ${currentUser.userId}`,
        );

        return {
          orderId: updated.id,
          status: fromPrismaOrderStatus(updated.status),
          paid: toMoneyNumber(updated.paid),
        };
      });
    } finally {
      await this.redis.releaseLock(lockKey, lockValue).catch(() => false);
    }
  }

  /**
   * 阻止内部收款和当前仍活跃的支付单并行处理同一订单
   *
   * 支付中的在线支付单需要先等待成功或过期
   * 待确认线下登记单需要先完成核销或人工处理后再继续登记内部收款
   */
  private async ensureNoBlockingPaymentOrder(tx: Prisma.TransactionClient, orderId: string, tenantId: string) {
    const latestPaymentOrder = await tx.paymentOrder.findFirst({
      where: { orderId, tenantId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        status: true,
        lastInitiatedAt: true,
      },
    });

    if (!latestPaymentOrder) {
      return;
    }

    const expirablePaymentOrder = toPaymentDomainExpirableSnapshot(latestPaymentOrder);
    if (shouldExpirePayingPaymentOrder(expirablePaymentOrder)) {
      const transition = buildExpirePayingPaymentOrderTransition(expirablePaymentOrder);
      if (!transition.allowed) {
        return;
      }

      await tx.paymentOrder.updateMany({
        where: { id: latestPaymentOrder.id, status: PrismaPaymentOrderStatusEnum.PAYING },
        data: toPrismaPaymentOrderUpdateData(transition.data),
      });
      return;
    }

    if (expirablePaymentOrder.status === PaymentOrderStatusEnum.PAYING) {
      throw new ConflictException('当前订单存在支付中的在线支付单，请先等待支付结果确认');
    }

    if (expirablePaymentOrder.status === PaymentOrderStatusEnum.PENDING_VERIFICATION) {
      throw new ConflictException('当前订单存在线下登记待确认记录，请先完成线下确认');
    }
  }
}
