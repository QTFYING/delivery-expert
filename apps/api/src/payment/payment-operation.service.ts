import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  PaymentMethodEnum as PrismaPaymentMethodEnum,
  PaymentOrderStatusEnum as PrismaPaymentOrderStatusEnum,
  PaymentRecordStatusEnum as PrismaPaymentRecordStatusEnum,
  type Prisma,
} from '@prisma/client';

import type {
  CreateCashVerificationResponse,
  InitiatePaymentResponse,
  SubmitOfflinePaymentRequest,
  SubmitOfflinePaymentResponse,
} from '@shou/types/contracts';

import { OfflinePaymentMethodEnum, PaymentOrderStatusEnum, type OfflinePaymentMethod } from '@shou/types/enums';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { BusinessException } from '../common/exceptions/business.exception';
import { decimal, toPrismaDecimal } from '../common/money';
import { ID_CONFIG } from '../id-generator/id-generator.constants';
import { IdGeneratorService } from '../id-generator/id-generator.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import {
  fromPrismaOrderStatus,
  fromPrismaPaymentMethod,
  fromPrismaPaymentOrderStatus,
  toPaymentDomainOrderSnapshot,
  toPaymentDomainStatusSnapshot,
  toPaymentDomainTransitionSnapshot,
  toPrismaPaymentOrderUpdateData,
} from './mapping/payment.mapper';

import { PaymentInitiationService } from './payment-initiation.service';
import { PaymentLedgerService } from './payment-ledger.service';
import { PaymentQueryService } from './payment-query.service';
import { PaymentWindowService } from './payment-window.service';
import { buildCashPaymentSubmittedTransition, buildCashPaymentVerifiedTransition, resolvePaymentOrderStatus } from './payment.domain';
import { getPaymentTenantId } from './payment.shared';

const PAYMENT_REQUEST_LOCK_SECONDS = 10;

@Injectable()
export class PaymentOperationService {
  private readonly logger = new Logger(PaymentOperationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly idGen: IdGeneratorService,
    private readonly queryService: PaymentQueryService,
    private readonly ledgerService: PaymentLedgerService,
    private readonly initiationService: PaymentInitiationService,
    private readonly paymentWindowService: PaymentWindowService,
  ) {}

  // 发起在线支付由独立子 service 编排，避免网关调用细节继续堆进操作 service
  async initiatePayment(token: string): Promise<InitiatePaymentResponse> {
    return this.initiationService.initiatePayment(token);
  }

  /**
   * 面向公开 H5 入口登记线下支付
   * 现金和其他方式已付都只作为线下备注登记，待租户确认后再入账
   */
  async submitOfflinePayment(token: string, request: SubmitOfflinePaymentRequest): Promise<SubmitOfflinePaymentResponse> {
    const paymentMethod = this.parseOfflinePaymentMethod(request.paymentMethod);
    if (!request.remark?.trim()) {
      throw new BusinessException(40002, '线下登记 remark 必填', 400);
    }

    const order = await this.queryService.getPublicOrderByToken(token);
    if (order.voided) {
      throw new BusinessException(1002, '二维码路由已过期', 410);
    }
    await this.assertOrderWithinPaymentWindow(
      {
        tenantId: order.tenantId,
        createdAt: order.createdAt,
      },
      this.prisma,
    );

    const lockKey = `payment:offline:${order.id}`;
    const lockValue = await this.redis.acquireLock(lockKey, PAYMENT_REQUEST_LOCK_SECONDS);
    if (!lockValue) {
      throw new ConflictException('支付处理进行中，请稍后重试');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const currentOrder = await tx.order.findUnique({ where: { id: order.id } });
        if (!currentOrder || currentOrder.deletedAt) {
          throw new BusinessException(40401, '订单不存在', 404);
        }
        await this.assertOrderWithinPaymentWindow(
          {
            tenantId: currentOrder.tenantId,
            createdAt: currentOrder.createdAt,
          },
          tx,
        );

        const latest = await this.queryService.getLatestPaymentOrder(currentOrder.id, tx);
        const currentPaymentOrder = await this.queryService.expireIfNeeded(latest, tx);
        const paymentStatus = resolvePaymentOrderStatus(
          toPaymentDomainOrderSnapshot(currentOrder),
          currentPaymentOrder ? toPaymentDomainStatusSnapshot(currentPaymentOrder) : null,
        );
        if (paymentStatus !== PaymentOrderStatusEnum.UNPAID) {
          throw new BusinessException(40402, '订单状态不是 unpaid，不允许登记线下支付', 400);
        }

        const payableAmount = this.ledgerService.getRemainingAmount(currentOrder);
        if (payableAmount.lte(0)) {
          throw new BusinessException(1001, '订单已支付完毕，不允许重复操作', 409);
        }

        const now = new Date();
        const offlineTransition = buildCashPaymentSubmittedTransition(paymentMethod, now);
        if (!offlineTransition.allowed) {
          throw new BusinessException(40001, offlineTransition.reason, 400);
        }
        const offlineData = toPrismaPaymentOrderUpdateData(offlineTransition.data);

        const paymentOrderId = await this.idGen.nextDailyId(ID_CONFIG.PAYMENT_ORDER.prefix, ID_CONFIG.PAYMENT_ORDER.digits);
        const created = await tx.paymentOrder.create({
          data: {
            id: paymentOrderId,
            tenantId: currentOrder.tenantId,
            orderId: currentOrder.id,
            amount: toPrismaDecimal(payableAmount),
            status: offlineData.status,
            paymentMethod: offlineData.paymentMethod,
            statusMessage: offlineData.statusMessage,
            offlineRemark: request.remark?.trim() || null,
            cashVerifyStatus: offlineData.cashVerifyStatus ?? null,
            offlineSubmittedAt: now,
            paidAt: offlineData.paidAt ?? null,
          },
        });

        return {
          orderNo: currentOrder.id,
          status: fromPrismaPaymentOrderStatus(created.status),
          statusMessage: created.statusMessage ?? undefined,
          selectedPaymentMethod: fromPrismaPaymentMethod(created.paymentMethod),
          offlinePayment: this.queryService.toOfflinePaymentInfo(created),
        };
      });
    } finally {
      await this.redis.releaseLock(lockKey, lockValue).catch(() => false);
    }
  }

  /**
   * 由租户财务确认线下款项已到账，并以统一账务逻辑完成核销入账
   * 线下确认只允许处理仍处于 PENDING_VERIFICATION 的线下登记支付单
   */
  async createCashVerification(currentUser: JwtPayload, orderId: string): Promise<CreateCashVerificationResponse> {
    const tenantId = getPaymentTenantId(currentUser);

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, tenantId, deletedAt: null },
      });
      if (!order) {
        throw new NotFoundException('订单不存在');
      }

      const paymentOrder = await tx.paymentOrder.findFirst({
        where: {
          orderId,
          tenantId,
          status: PrismaPaymentOrderStatusEnum.PENDING_VERIFICATION,
          paymentMethod: { in: [PrismaPaymentMethodEnum.CASH, PrismaPaymentMethodEnum.OTHER_PAID] },
        },
        orderBy: [{ offlineSubmittedAt: 'desc' }, { createdAt: 'desc' }],
      });
      if (!paymentOrder) {
        throw new ConflictException('当前订单没有待确认的线下登记记录');
      }

      const remaining = this.ledgerService.getRemainingAmount(order);
      const payable = decimal(paymentOrder.amount);
      if (remaining.lt(payable) || remaining.lte(0)) {
        throw new ConflictException('订单当前可核销金额异常，无法完成现金核销');
      }

      const verifiedAt = new Date();
      const verifiedTransition = buildCashPaymentVerifiedTransition(toPaymentDomainTransitionSnapshot(paymentOrder), verifiedAt);
      if (!verifiedTransition.allowed) {
        throw new ConflictException(verifiedTransition.reason);
      }

      const updatedPaymentOrder = await tx.paymentOrder.updateMany({
        where: {
          id: paymentOrder.id,
          status: PrismaPaymentOrderStatusEnum.PENDING_VERIFICATION,
        },
        data: toPrismaPaymentOrderUpdateData(verifiedTransition.data),
      });

      if (updatedPaymentOrder.count === 0) {
        throw new ConflictException('现金核销已被处理或状态已变化，请勿重复提交');
      }

      const updatedOrder = await this.ledgerService.createPaymentRecordAndApplyOrder(tx, order, {
        amount: payable,
        channel: paymentOrder.paymentMethod === PrismaPaymentMethodEnum.OTHER_PAID ? 'other_paid' : 'cash',
        status: PrismaPaymentRecordStatusEnum.SUCCESS,
        paidAt: verifiedAt,
        gatewayTradeNo: `${paymentOrder.paymentMethod === PrismaPaymentMethodEnum.OTHER_PAID ? 'other' : 'cash'}_${paymentOrder.id}`,
      });

      this.logger.log(
        `[AUDIT] 线下登记确认成功 - 租户: ${order.tenantId}, 订单: ${order.id}, 支付单: ${paymentOrder.id}, 操作人: ${currentUser.userId}, 金额: ${paymentOrder.amount}`,
      );

      return {
        orderId: updatedOrder.id,
        orderStatus: fromPrismaOrderStatus(updatedOrder.status),
        paymentStatus: 'paid',
        verifiedAt: verifiedAt.toISOString(),
      };
    });
  }

  /**
   * 仅允许 H5 协议约定的线下支付闭集进入后续处理
   * 非枚举值直接按业务参数错误返回
   */
  private parseOfflinePaymentMethod(value: string): OfflinePaymentMethod {
    if (value === OfflinePaymentMethodEnum.CASH) return OfflinePaymentMethodEnum.CASH;
    if (value === OfflinePaymentMethodEnum.OTHER_PAID) return OfflinePaymentMethodEnum.OTHER_PAID;
    throw new BusinessException(40001, 'paymentMethod 不是合法值', 400);
  }

  /**
   * 线下登记和公开支付页共享同一套订单支付窗口约束
   * 超出租户配置的支付有效期后，服务端直接拒绝新的线下登记动作
   */
  private async assertOrderWithinPaymentWindow(
    input: {
      tenantId: string;
      createdAt: Date;
    },
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    await this.paymentWindowService.assertOrderWithinPaymentWindow(input, client);
  }
}
