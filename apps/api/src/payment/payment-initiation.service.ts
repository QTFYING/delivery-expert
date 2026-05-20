import { Injectable, Logger } from '@nestjs/common';
import {
  type Prisma,
  PaymentMethodEnum as PrismaPaymentMethodEnum,
  PaymentOrderStatusEnum as PrismaPaymentOrderStatusEnum,
  TenantPaymentConfigStoredStatusEnum as PrismaTenantPaymentConfigStoredStatusEnum,
} from '@prisma/client';

import type { InitiatePaymentResponse } from '@shou/types/contracts';
import { OrderStatusEnum, PaymentOrderStatusEnum } from '@shou/types/enums';
import { BusinessException } from '../common/exceptions/business.exception';
import { toPrismaDecimal } from '../common/money';
import { ID_CONFIG } from '../id-generator/id-generator.constants';
import { IdGeneratorService } from '../id-generator/id-generator.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PaymentGatewayRegistry } from './gateway/payment-gateway.registry';
import type { CreateCounterPaymentResult } from './gateway/payment-gateway.types';

import {
  toPaymentDomainOrderSnapshot,
  toPaymentDomainStatusSnapshot,
  toPaymentDomainTransitionSnapshot,
  toPrismaPaymentOrderUpdateData,
} from './mapping/payment.mapper';

import { PaymentLedgerService } from './payment-ledger.service';
import { PaymentQueryService } from './payment-query.service';
import { PaymentTenantConfigService } from './payment-tenant-config.service';
import { PaymentWindowService } from './payment-window.service';
import { buildActivateOnlinePaymentAttemptTransition, buildGatewayCreateFailedTransition, resolvePaymentOrderStatus } from './payment.domain';
import type { ActivatedOnlinePaymentAttempt, PreparedOnlinePaymentAttempt } from './payment-initiation.types';
import { buildGatewayTradeNo, buildPaymentOrderSummary } from './payment.shared';

const PAYMENT_INITIATE_LOCK_SECONDS = 20;

@Injectable()
export class PaymentInitiationService {
  private readonly logger = new Logger(PaymentInitiationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly idGen: IdGeneratorService,
    private readonly queryService: PaymentQueryService,
    private readonly ledgerService: PaymentLedgerService,
    private readonly paymentTenantConfigService: PaymentTenantConfigService,
    private readonly paymentWindowService: PaymentWindowService,
    private readonly gatewayRegistry: PaymentGatewayRegistry,
  ) {}

  /**
   * 基于订单当前应付金额发起一笔新的在线支付尝试，并返回前端应跳转的收银台地址
   * 本流程保持短事务创建占位单、事务外请求网关、短事务激活支付单的边界
   */
  async initiatePayment(token: string): Promise<InitiatePaymentResponse> {
    const order = await this.queryService.getPublicOrderByToken(token);
    if (order.voided) {
      throw new BusinessException(1002, '二维码路由已过期', 410);
    }
    await this.paymentWindowService.assertOrderWithinPaymentWindow({
      tenantId: order.tenantId,
      orderTime: order.orderTime,
    });

    const lockKey = `payment:initiate:${order.id}`;
    const lockValue = await this.redis.acquireLock(lockKey, PAYMENT_INITIATE_LOCK_SECONDS);
    if (!lockValue) {
      throw new BusinessException(1003, '支付进行中，请勿重复发起', 409);
    }

    try {
      const restored = await this.restoreActivePaymentAttempt(order.id);
      if (restored) {
        return restored;
      }

      const prepared = await this.prepareOnlinePaymentAttempt(order.id);
      const cashier = await this.requestCashierUrlAndMarkFailure(prepared);
      await this.activateOnlinePaymentAttempt({ ...prepared, cashierUrl: cashier.cashierUrl, cashierExpiresAt: cashier.cashierExpiresAt });

      return {
        cashierUrl: cashier.cashierUrl,
        orderId: prepared.orderId,
        payableAmount: prepared.payableAmount.toFixed(2),
      };
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      throw new BusinessException(50001, '支付网关统一下单调度失败', 500);
    } finally {
      await this.redis.releaseLock(lockKey, lockValue).catch(() => false);
    }
  }

  /**
   * 优先恢复当前未过期的在线支付尝试
   * 该路径只返回已保存的收银台地址，不创建新的第三方支付单
   */
  private async restoreActivePaymentAttempt(orderId: string): Promise<InitiatePaymentResponse | null> {
    return this.prisma.$transaction(async (tx) => {
      const currentOrder = await tx.order.findUnique({ where: { id: orderId } });
      if (!currentOrder || currentOrder.deletedAt) {
        throw new BusinessException(40401, '订单不存在', 404);
      }
      if (currentOrder.voided) {
        throw new BusinessException(1002, '二维码路由已过期', 410);
      }
      await this.assertOrderWithinPaymentWindow(
        {
          tenantId: currentOrder.tenantId,
          orderTime: currentOrder.orderTime,
        },
        tx,
      );

      const latest = await this.queryService.getLatestPaymentOrder(orderId, tx);
      const currentPaymentOrder = await this.queryService.expireIfNeeded(latest, tx);
      const paymentStatus = resolvePaymentOrderStatus(
        toPaymentDomainOrderSnapshot(currentOrder),
        currentPaymentOrder ? toPaymentDomainStatusSnapshot(currentPaymentOrder) : null,
      );

      if (paymentStatus !== PaymentOrderStatusEnum.PAYING || !currentPaymentOrder) {
        return null;
      }
      if (
        currentPaymentOrder.status !== PrismaPaymentOrderStatusEnum.PAYING ||
        currentPaymentOrder.paymentMethod !== PrismaPaymentMethodEnum.ONLINE ||
        !currentPaymentOrder.cashierUrl ||
        !currentPaymentOrder.cashierExpiresAt
      ) {
        throw new BusinessException(1003, '支付进行中，请稍候确认', 409);
      }

      const payableAmount = this.ledgerService.getRemainingAmount(currentOrder);
      if (payableAmount.lte(0) || toPaymentDomainOrderSnapshot(currentOrder).status === OrderStatusEnum.PAID) {
        throw new BusinessException(1001, '订单已支付完毕，不允许重复发起', 409);
      }
      if (!payableAmount.equals(currentPaymentOrder.amount.toString())) {
        throw new BusinessException(1003, '订单应付金额已变化，请重新发起支付', 409);
      }

      return {
        cashierUrl: currentPaymentOrder.cashierUrl,
        orderId: currentOrder.id,
        payableAmount: payableAmount.toFixed(2),
      };
    });
  }

  /**
   * 在短事务内完成在线支付尝试的资格校验和占位支付单创建
   * 占位单保持 UNPAID，避免第三方建单尚未成功时提前把 H5 状态暴露为 PAYING
   */
  private async prepareOnlinePaymentAttempt(orderId: string): Promise<PreparedOnlinePaymentAttempt> {
    return this.prisma.$transaction(async (tx) => {
      const currentOrder = await tx.order.findUnique({ where: { id: orderId }, include: { lineItems: true } });
      if (!currentOrder || currentOrder.deletedAt) {
        throw new BusinessException(40401, '订单不存在', 404);
      }
      if (currentOrder.voided) {
        throw new BusinessException(1002, '二维码路由已过期', 410);
      }
      await this.assertOrderWithinPaymentWindow(
        {
          tenantId: currentOrder.tenantId,
          orderTime: currentOrder.orderTime,
        },
        tx,
      );

      const latest = await this.queryService.getLatestPaymentOrder(orderId, tx);
      const currentPaymentOrder = await this.queryService.expireIfNeeded(latest, tx);
      const orderSnapshot = toPaymentDomainOrderSnapshot(currentOrder);
      const paymentStatus = resolvePaymentOrderStatus(orderSnapshot, currentPaymentOrder ? toPaymentDomainStatusSnapshot(currentPaymentOrder) : null);
      const payableAmount = this.ledgerService.getRemainingAmount(currentOrder);

      if (payableAmount.lte(0) || orderSnapshot.status === OrderStatusEnum.PAID) {
        throw new BusinessException(1001, '订单已支付完毕，不允许重复发起', 409);
      }
      if (paymentStatus === PaymentOrderStatusEnum.PAYING) {
        throw new BusinessException(1003, '支付进行中，请稍候确认', 409);
      }
      if (paymentStatus === PaymentOrderStatusEnum.PENDING_VERIFICATION) {
        throw new BusinessException(40402, '订单已登记现金支付，等待财务核销', 400);
      }

      const activePaymentChannel = await this.paymentTenantConfigService.getActivePaymentChannelSnapshotByTenantId(currentOrder.tenantId, tx);
      const availability = this.paymentTenantConfigService.resolveOnlinePaymentAvailability(activePaymentChannel);
      if (!availability.canInitiate || !availability.prismaChannel) {
        throw new BusinessException(1004, availability.failureMessage ?? '当前租户支付渠道不可用', 409);
      }
      const gatewayProvider = this.gatewayRegistry.getProvider(availability.prismaChannel);
      const onlineAttemptNo = await this.resolveNextOnlineAttemptNo(tx, currentOrder.id);
      const gatewayTradeNo = buildGatewayTradeNo(currentOrder.id, onlineAttemptNo);
      const paymentOrderId = await this.idGen.nextDailyId(ID_CONFIG.PAYMENT_ORDER.prefix, ID_CONFIG.PAYMENT_ORDER.digits);
      await tx.paymentOrder.create({
        data: {
          id: paymentOrderId,
          tenantId: currentOrder.tenantId,
          orderId: currentOrder.id,
          amount: toPrismaDecimal(payableAmount),
          status: PrismaPaymentOrderStatusEnum.UNPAID,
          paymentMethod: PrismaPaymentMethodEnum.ONLINE,
          channel: gatewayProvider.channel,
          statusMessage: '支付发起中',
          onlineAttemptNo,
          gatewayTradeNo,
        },
      });

      return {
        paymentOrderId,
        orderId: currentOrder.id,
        tenantId: currentOrder.tenantId,
        gatewayTradeNo,
        orderDescription: buildPaymentOrderSummary(currentOrder.lineItems),
        payableAmount,
        channel: gatewayProvider.channel,
        channelConfig: activePaymentChannel.config ?? {},
      };
    });
  }

  /**
   * 计算当前订单下一次线上支付尝试序号。
   * 序号只以 payment_orders 为事实源，不依赖 Redis 或订单表冗余计数。
   */
  private async resolveNextOnlineAttemptNo(tx: Prisma.TransactionClient, orderId: string): Promise<number> {
    const aggregate = await tx.paymentOrder.aggregate({
      where: {
        orderId,
        paymentMethod: PrismaPaymentMethodEnum.ONLINE,
      },
      _max: {
        onlineAttemptNo: true,
      },
    });

    return (aggregate._max.onlineAttemptNo ?? 0) + 1;
  }

  /**
   * 在数据库事务外调用标准支付网关建单接口
   * 如果第三方请求失败，只尽力回写占位单失败文案，不把支付单切成 PAYING
   */
  private async requestCashierUrlAndMarkFailure(prepared: PreparedOnlinePaymentAttempt): Promise<CreateCounterPaymentResult> {
    try {
      const gatewayProvider = this.gatewayRegistry.getProvider(prepared.channel);
      const result = await gatewayProvider.createCounterPayment({
        orderId: prepared.orderId,
        orderDescription: prepared.orderDescription,
        gatewayTradeNo: prepared.gatewayTradeNo,
        amount: prepared.payableAmount,
        config: prepared.channelConfig,
      });

      return result;
    } catch (error) {
      await this.markOnlinePaymentAttemptFailed(prepared.paymentOrderId, '支付发起失败，请重试').catch((markError) => {
        this.logger.warn(
          `[AUDIT] 网关建单失败后标记支付单失败文案异常: paymentOrder=${prepared.paymentOrderId}, error=${markError instanceof Error ? markError.message : String(markError)}`,
        );
      });
      await this.markTenantPaymentConfigInvalidIfNeeded(prepared, error).catch((markError) => {
        this.logger.warn(
          `[AUDIT] 网关建单失败后标记租户支付配置无效异常: tenant=${prepared.tenantId}, channel=${prepared.channel}, error=${markError instanceof Error ? markError.message : String(markError)}`,
        );
      });
      throw error;
    }
  }

  /**
   * 网关建单成功后，在第二个短事务内把占位单激活为 PAYING
   * 激活前重新校验订单金额和最新支付单，避免状态漂移后仍把旧支付尝试返回给前端
   */
  private async activateOnlinePaymentAttempt(prepared: ActivatedOnlinePaymentAttempt): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const paymentOrder = await tx.paymentOrder.findUnique({ where: { id: prepared.paymentOrderId } });
      if (!paymentOrder || paymentOrder.gatewayTradeNo !== prepared.gatewayTradeNo) {
        throw new BusinessException(1003, '支付状态已变化，请重新发起', 409);
      }

      const currentOrder = await tx.order.findUnique({ where: { id: prepared.orderId } });
      if (!currentOrder || currentOrder.deletedAt) {
        throw new BusinessException(40401, '订单不存在', 404);
      }
      if (currentOrder.voided) {
        throw new BusinessException(1002, '二维码路由已过期', 410);
      }
      await this.assertOrderWithinPaymentWindow(
        {
          tenantId: currentOrder.tenantId,
          orderTime: currentOrder.orderTime,
        },
        tx,
      );

      const latest = await this.queryService.getLatestPaymentOrder(prepared.orderId, tx);
      if (latest?.id !== prepared.paymentOrderId) {
        throw new BusinessException(1003, '订单支付状态已变化，请重新发起', 409);
      }

      const payableAmount = this.ledgerService.getRemainingAmount(currentOrder);
      if (payableAmount.lte(0) || toPaymentDomainOrderSnapshot(currentOrder).status === OrderStatusEnum.PAID) {
        throw new BusinessException(1001, '订单已支付完毕，不允许重复发起', 409);
      }
      if (!payableAmount.equals(prepared.payableAmount)) {
        throw new BusinessException(1003, '订单应付金额已变化，请重新发起支付', 409);
      }

      const transition = buildActivateOnlinePaymentAttemptTransition(toPaymentDomainTransitionSnapshot(paymentOrder), new Date(), {
        url: prepared.cashierUrl,
        expiresAt: prepared.cashierExpiresAt,
      });
      if (!transition.allowed) {
        throw new BusinessException(1003, transition.reason, 409);
      }

      const activated = await tx.paymentOrder.updateMany({
        where: {
          id: prepared.paymentOrderId,
          gatewayTradeNo: prepared.gatewayTradeNo,
          status: PrismaPaymentOrderStatusEnum.UNPAID,
          paymentMethod: PrismaPaymentMethodEnum.ONLINE,
        },
        data: toPrismaPaymentOrderUpdateData(transition.data),
      });

      if (activated.count === 0) {
        throw new BusinessException(1003, '支付状态已变化，请重新发起', 409);
      }
    });
  }

  /**
   * 建单失败时只回写占位支付单文案
   * 支付单仍保持 UNPAID，保证 H5 状态不会被未确认的第三方调用推进为支付中
   */
  private async markOnlinePaymentAttemptFailed(paymentOrderId: string, statusMessage: string): Promise<void> {
    const paymentOrder = await this.prisma.paymentOrder.findUnique({ where: { id: paymentOrderId } });
    if (!paymentOrder) {
      return;
    }

    const transition = buildGatewayCreateFailedTransition(toPaymentDomainStatusSnapshot(paymentOrder), statusMessage);
    if (!transition.allowed) {
      return;
    }

    await this.prisma.paymentOrder.updateMany({
      where: {
        id: paymentOrderId,
        status: PrismaPaymentOrderStatusEnum.UNPAID,
      },
      data: toPrismaPaymentOrderUpdateData(transition.data),
    });
  }

  /** 仅在网关明确返回商户配置类错误时，把当前租户渠道降级为无效 */
  private async markTenantPaymentConfigInvalidIfNeeded(prepared: PreparedOnlinePaymentAttempt, error: unknown): Promise<void> {
    if (!(error instanceof BusinessException) || error.bizCode !== 1004) {
      return;
    }

    await this.prisma.tenantPaymentConfig.updateMany({
      where: {
        tenantId: prepared.tenantId,
        channel: prepared.channel,
        status: PrismaTenantPaymentConfigStoredStatusEnum.AVAILABLE,
      },
      data: {
        status: PrismaTenantPaymentConfigStoredStatusEnum.INVALID,
        invalidReason: this.readBusinessExceptionMessage(error),
        lastValidatedAt: new Date(),
        updatedBy: 'SYSTEM',
      },
    });
  }

  /** 从业务异常响应中提取可落库的失败原因，避免落入 Nest 默认异常文案 */
  private readBusinessExceptionMessage(error: BusinessException): string {
    const response = error.getResponse();
    if (typeof response === 'object' && response !== null && 'message' in response) {
      const message = (response as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) {
        return message.trim();
      }
    }

    return error.message || '当前商户拉卡拉配置不可用，请联系管理员';
  }

  /**
   * 在支付发起链路的每个关键节点再次确认订单没有超过租户支付有效期
   * 这样可以兜住入口校验后到事务落单前的时间漂移和配置变更
   */
  private async assertOrderWithinPaymentWindow(
    input: {
      tenantId: string;
      orderTime: Date;
    },
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    await this.paymentWindowService.assertOrderWithinPaymentWindow(input, client);
  }
}
