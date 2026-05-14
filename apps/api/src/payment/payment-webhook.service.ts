import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  PaymentChannelEnum as PrismaPaymentChannelEnum,
  PaymentMethodEnum as PrismaPaymentMethodEnum,
  PaymentOrderStatusEnum as PrismaPaymentOrderStatusEnum,
  PaymentRecordStatusEnum as PrismaPaymentRecordStatusEnum,
  PaymentWebhookEventStatusEnum as PrismaPaymentWebhookEventStatusEnum,
} from '@prisma/client';
import { decimal } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import type { LakalaWebhookRequest } from './gateway/lakala-webhook.normalizer';
import { PaymentGatewayRegistry } from './gateway/payment-gateway.registry';
import type { NormalizedGatewayWebhook } from './gateway/payment-gateway.types';
import {
  fromPrismaPaymentChannel,
  toPaymentDomainOrderSnapshot,
  toPaymentDomainSettlementSnapshot,
  toPaymentDomainTransitionSnapshot,
  toPrismaPaymentOrderUpdateData,
} from './mapping/payment.mapper';
import { PaymentWebhookAuditService } from './payment-webhook-audit.service';
import { PaymentLedgerService } from './payment-ledger.service';
import { buildGatewayPaymentFailedTransition, buildGatewayPaymentSucceededTransition } from './payment.domain';

export type LakalaWebhookContext = {
  authorization?: string;
};

type LakalaWebhookResponse = { code: 'SUCCESS'; message: 'OK' };

type LakalaWebhookOutcome = {
  response: LakalaWebhookResponse;
  audit: {
    tenantId?: string | null;
    orderId?: string | null;
    paymentOrderId?: string | null;
    processingStatus: PrismaPaymentWebhookEventStatusEnum;
    reason: string;
  };
  error?: BadRequestException;
};

@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: PaymentLedgerService,
    private readonly auditService: PaymentWebhookAuditService,
    private readonly gatewayRegistry: PaymentGatewayRegistry,
  ) {}

  /**
   * 按当前已验签并成功入账的聚合收银台 JSON 回调结构处理拉卡拉通知。
   * 成功入账先通过 paymentOrder 条件更新抢占结算权，再写流水和累计订单金额，避免依赖唯一键异常作为幂等主路径。
   */
  async handleLakalaWebhook(webhookRequest: LakalaWebhookRequest, context: LakalaWebhookContext) {
    const auditEvent = await this.auditService.createLakalaEvent({
      rawBody: webhookRequest.rawBody,
      headers: webhookRequest.headerSnapshot,
    });
    const auditProcessedAt = () => new Date();

    let webhook: NormalizedGatewayWebhook;
    try {
      const gatewayProvider = this.gatewayRegistry.getProvider(PrismaPaymentChannelEnum.LAKALA);
      webhook = gatewayProvider.verifyAndNormalizeWebhook({
        ...webhookRequest,
        authorization: context.authorization,
      });
      await this.recordAuditEvent(auditEvent.id, {
        payload: webhook.rawPayload,
        normalized: webhook.normalizedPayload,
        gatewayTradeNo: webhook.gatewayTradeNo ?? null,
        externalStatus: webhook.rawExternalStatus ?? null,
      });
    } catch (error) {
      await this.recordAuditEvent(auditEvent.id, {
        processingStatus: PrismaPaymentWebhookEventStatusEnum.REJECTED,
        reason: this.errorMessage(error),
        processedAt: auditProcessedAt(),
      });
      throw error;
    }

    this.logger.log(`[AUDIT] 收到拉卡拉 Webhook 回调: ${JSON.stringify(webhook.rawPayload)}`);
    if (!webhook.signatureVerified) {
      if (webhook.signatureFailureReason) {
        this.logger.warn(webhook.signatureFailureReason);
      }
      this.logger.warn(`[AUDIT] [ALARM] Webhook 验签失败: ${JSON.stringify(webhook.rawPayload)}`);
      await this.recordAuditEvent(auditEvent.id, {
        signatureVerified: false,
        processingStatus: PrismaPaymentWebhookEventStatusEnum.REJECTED,
        reason: webhook.signatureFailureReason ?? 'signature_verification_failed',
        processedAt: auditProcessedAt(),
      });
      throw new BadRequestException('Webhook signature verification failed');
    }

    const gatewayTradeNo = webhook.gatewayTradeNo;
    const externalStatus = webhook.rawExternalStatus;
    await this.recordAuditEvent(auditEvent.id, {
      signatureVerified: true,
      gatewayTradeNo: gatewayTradeNo ?? null,
      externalStatus: externalStatus ?? null,
    });

    if (!gatewayTradeNo) {
      this.logger.warn(`[AUDIT] Webhook 缺失 gatewayTradeNo: ${JSON.stringify(webhook.rawPayload)}`);
      await this.recordAuditEvent(auditEvent.id, {
        processingStatus: PrismaPaymentWebhookEventStatusEnum.REJECTED,
        reason: 'missing_gateway_trade_no',
        processedAt: auditProcessedAt(),
      });
      throw new BadRequestException('Missing gatewayTradeNo in webhook payload');
    }

    let outcome: LakalaWebhookOutcome;
    try {
      outcome = await this.prisma.$transaction(async (tx) => {
        const resolvedPaymentOrder = await tx.paymentOrder.findFirst({
          where: { gatewayTradeNo },
          orderBy: { createdAt: 'desc' },
        });

        if (!resolvedPaymentOrder) {
          return this.buildWebhookOutcome(PrismaPaymentWebhookEventStatusEnum.IGNORED, 'payment_order_not_found');
        }

        if (webhook.status === 'FAILED') {
          const failedTransition = buildGatewayPaymentFailedTransition(
            toPaymentDomainTransitionSnapshot(resolvedPaymentOrder),
            webhook.failureMessage,
          );
          if (!failedTransition.allowed) {
            this.logger.log(
              `[AUDIT] 拉卡拉 Webhook 忽略失败回调: gatewayTradeNo=${gatewayTradeNo}, status=${externalStatus ?? '-'}, reason=${failedTransition.reason}, paymentOrderStatus=${resolvedPaymentOrder.status}, paymentMethod=${resolvedPaymentOrder.paymentMethod ?? '-'}`,
            );
            return this.buildWebhookOutcome(PrismaPaymentWebhookEventStatusEnum.IGNORED, failedTransition.reason, {
              tenantId: resolvedPaymentOrder.tenantId,
              orderId: resolvedPaymentOrder.orderId,
              paymentOrderId: resolvedPaymentOrder.id,
            });
          }

          const expiredPaymentOrder = await tx.paymentOrder.updateMany({
            where: {
              id: resolvedPaymentOrder.id,
              status: PrismaPaymentOrderStatusEnum.PAYING,
              paymentMethod: PrismaPaymentMethodEnum.ONLINE,
            },
            data: toPrismaPaymentOrderUpdateData(failedTransition.data),
          });
          if (expiredPaymentOrder.count === 0) {
            this.logger.log(`[AUDIT] 拉卡拉 Webhook 忽略失败回调，支付单已被处理: gatewayTradeNo=${gatewayTradeNo}`);
            return this.buildWebhookOutcome(PrismaPaymentWebhookEventStatusEnum.IGNORED, 'failure_callback_already_processed', {
              tenantId: resolvedPaymentOrder.tenantId,
              orderId: resolvedPaymentOrder.orderId,
              paymentOrderId: resolvedPaymentOrder.id,
            });
          }
          return this.buildWebhookOutcome(PrismaPaymentWebhookEventStatusEnum.PROCESSED, 'payment_order_expired_by_gateway_failure', {
            tenantId: resolvedPaymentOrder.tenantId,
            orderId: resolvedPaymentOrder.orderId,
            paymentOrderId: resolvedPaymentOrder.id,
          });
        }

        if (webhook.status !== 'SUCCESS') {
          this.logger.log(`[AUDIT] 拉卡拉 Webhook 非成功终态，忽略本次入账: gatewayTradeNo=${gatewayTradeNo}, status=${externalStatus ?? '-'}`);
          return this.buildWebhookOutcome(PrismaPaymentWebhookEventStatusEnum.IGNORED, 'unknown_or_non_final_status', {
            tenantId: resolvedPaymentOrder.tenantId,
            orderId: resolvedPaymentOrder.orderId,
            paymentOrderId: resolvedPaymentOrder.id,
          });
        }

        const order = await tx.order.findUnique({ where: { id: resolvedPaymentOrder.orderId } });
        if (!order || order.deletedAt) {
          return this.buildWebhookOutcome(PrismaPaymentWebhookEventStatusEnum.IGNORED, 'order_not_found_or_deleted', {
            tenantId: resolvedPaymentOrder.tenantId,
            orderId: resolvedPaymentOrder.orderId,
            paymentOrderId: resolvedPaymentOrder.id,
          });
        }

        if (webhook.amountParseError) {
          return this.buildWebhookOutcome(PrismaPaymentWebhookEventStatusEnum.REJECTED, 'amount_invalid', {
            tenantId: order.tenantId,
            orderId: order.id,
            paymentOrderId: resolvedPaymentOrder.id,
            error: new BadRequestException(webhook.amountParseError),
          });
        }

        const paidAt = webhook.paidAt ?? new Date();
        const successTransition = buildGatewayPaymentSucceededTransition(
          toPaymentDomainOrderSnapshot(order),
          toPaymentDomainSettlementSnapshot(resolvedPaymentOrder),
          {
            channel: fromPrismaPaymentChannel(webhook.channel),
            amount: webhook.amount,
            paidAt,
          },
        );

        if (!successTransition.allowed) {
          if (successTransition.code !== 'AMOUNT_MISMATCH') {
            this.logger.log(`[AUDIT] 拉卡拉 Webhook 忽略成功回调: gatewayTradeNo=${gatewayTradeNo}, reason=${successTransition.reason}`);
            return this.buildWebhookOutcome(PrismaPaymentWebhookEventStatusEnum.IGNORED, successTransition.reason, {
              tenantId: order.tenantId,
              orderId: order.id,
              paymentOrderId: resolvedPaymentOrder.id,
            });
          }

          const orderAmount = decimal(resolvedPaymentOrder.amount);
          this.logger.warn(
            `[AUDIT] Webhook 金额不匹配: gatewayTradeNo=${gatewayTradeNo}, expected=${orderAmount.toFixed(2)}, actual=${webhook.amount.toFixed(2)}`,
          );
          return this.buildWebhookOutcome(PrismaPaymentWebhookEventStatusEnum.REJECTED, 'amount_mismatch', {
            tenantId: order.tenantId,
            orderId: order.id,
            paymentOrderId: resolvedPaymentOrder.id,
            error: new BadRequestException('Webhook amount does not match order amount'),
          });
        }

        const fee = decimal(0);
        const amount = decimal(resolvedPaymentOrder.amount);
        const net = amount.minus(fee);

        /**
         * 抢占本次在线支付单的唯一结算权。
         * 并发重复成功回调只有一个能把 PAYING 改为 PAID，其余请求会在下方幂等返回。
         */
        const claimedPaymentOrder = await tx.paymentOrder.updateMany({
          where: {
            id: resolvedPaymentOrder.id,
            gatewayTradeNo,
            status: PrismaPaymentOrderStatusEnum.PAYING,
            paymentMethod: PrismaPaymentMethodEnum.ONLINE,
          },
          data: toPrismaPaymentOrderUpdateData(successTransition.data),
        });

        /**
         * 未抢到结算权说明支付单已被其他回调处理。
         * 这里直接应答 SUCCESS，避免拉卡拉继续重试同一通知。
         */
        if (claimedPaymentOrder.count === 0) {
          this.logger.log(`[AUDIT] 拉卡拉 Webhook 幂等命中，支付单已被处理: gatewayTradeNo=${gatewayTradeNo}`);
          return this.buildWebhookOutcome(PrismaPaymentWebhookEventStatusEnum.IGNORED, 'idempotent_already_processed', {
            tenantId: order.tenantId,
            orderId: order.id,
            paymentOrderId: resolvedPaymentOrder.id,
          });
        }

        /**
         * 抢占成功后才写入 payments 流水。
         * 这条流水代表已确认入账事实，后续订单实收累计继续复用统一 ledger 逻辑。
         */
        await this.ledgerService.createPaymentRecord(tx, {
          tenantId: order.tenantId,
          orderId: order.id,
          customer: order.customer,
          amount,
          channel: webhook.channel.toLowerCase(),
          fee,
          net,
          status: PrismaPaymentRecordStatusEnum.SUCCESS,
          gatewayTradeNo,
          paidAt,
        });

        /**
         * 统一累计订单实收金额与订单状态。
         * 这里不能回退到局部 read-modify-write，避免并发入账覆盖 orders.paid。
         */
        await this.ledgerService.applyOrderPaidAmountWithRetry(tx, {
          orderId: order.id,
          delta: amount,
        });
        this.logger.log(
          `[AUDIT] Webhook 入账成功 - 租户: ${order.tenantId}, 订单: ${order.id}, 支付单: ${resolvedPaymentOrder.id}, 金额: ${amount}, 外部流水号: ${gatewayTradeNo}`,
        );
        return this.buildWebhookOutcome(PrismaPaymentWebhookEventStatusEnum.PROCESSED, 'payment_record_created', {
          tenantId: order.tenantId,
          orderId: order.id,
          paymentOrderId: resolvedPaymentOrder.id,
        });
      });
    } catch (error) {
      await this.recordAuditEvent(auditEvent.id, {
        processingStatus: PrismaPaymentWebhookEventStatusEnum.FAILED,
        reason: this.errorMessage(error),
        processedAt: auditProcessedAt(),
      });
      throw error;
    }

    await this.recordAuditEvent(auditEvent.id, {
      ...outcome.audit,
      gatewayTradeNo,
      externalStatus: externalStatus ?? null,
      signatureVerified: true,
      processedAt: auditProcessedAt(),
    });

    if (outcome.error) {
      throw outcome.error;
    }

    return outcome.response;
  }

  // 生成统一的 Webhook 处理结果，业务响应始终按拉卡拉要求返回 SUCCESS/OK
  private buildWebhookOutcome(
    processingStatus: PrismaPaymentWebhookEventStatusEnum,
    reason: string,
    options: {
      tenantId?: string | null;
      orderId?: string | null;
      paymentOrderId?: string | null;
      error?: BadRequestException;
    } = {},
  ): LakalaWebhookOutcome {
    return {
      response: { code: 'SUCCESS', message: 'OK' },
      audit: {
        tenantId: options.tenantId ?? null,
        orderId: options.orderId ?? null,
        paymentOrderId: options.paymentOrderId ?? null,
        processingStatus,
        reason,
      },
      error: options.error,
    };
  }

  // 审计记录失败不能反向影响已完成的支付状态裁决
  private async recordAuditEvent(eventId: string, input: Parameters<PaymentWebhookAuditService['updateEvent']>[1]) {
    try {
      await this.auditService.updateEvent(eventId, input);
    } catch (error) {
      this.logger.error(`支付 Webhook 审计记录写入失败: ${this.errorMessage(error)}`);
    }
  }

  // 提取异常消息用于结构化审计原因，避免直接序列化异常对象
  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
