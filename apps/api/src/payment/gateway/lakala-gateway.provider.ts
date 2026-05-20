import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PaymentChannelEnum as PrismaPaymentChannelEnum } from '@prisma/client';
import { decimal } from '../../common/money';
import { paymentConfig } from '../../config/payment.config';
import {
  isLakalaFailureStatus,
  isLakalaSuccessStatus,
  parseLakalaAmount,
  parseLakalaDateTime,
  verifyLakalaSignature,
} from './lakala.adapter';
import { LakalaCounterService } from './lakala-counter.service';
import { normalizeCurrentLakalaWebhookPayload, parseCurrentLakalaWebhookJson } from './lakala-webhook.normalizer';
import type {
  CreateCounterPaymentInput,
  CreateCounterPaymentResult,
  GatewayWebhookPaymentStatus,
  NormalizedGatewayWebhook,
  PaymentGatewayProvider,
  PaymentGatewayWebhookInput,
} from './payment-gateway.types';

@Injectable()
export class LakalaGatewayProvider implements PaymentGatewayProvider {
  readonly channel = PrismaPaymentChannelEnum.LAKALA;

  constructor(
    private readonly counterService: LakalaCounterService,
    @Inject(paymentConfig.KEY)
    private readonly paymentSettings: ConfigType<typeof paymentConfig>,
  ) {}

  // 创建聚合收银台支付单，并隐藏拉卡拉建单报文、签名和响应字段差异
  async createCounterPayment(input: CreateCounterPaymentInput): Promise<CreateCounterPaymentResult> {
    const result = await this.counterService.requestCashierUrl(input.orderId, input.orderDescription, input.gatewayTradeNo, input.amount, input.config);

    return {
      gatewayTradeNo: input.gatewayTradeNo,
      cashierUrl: result.cashierUrl,
      cashierExpiresAt: result.cashierExpiresAt,
    };
  }

  // 验签并归一拉卡拉当前版本 JSON Webhook，输出平台内部支付结果
  verifyAndNormalizeWebhook(input: PaymentGatewayWebhookInput): NormalizedGatewayWebhook {
    const payload = parseCurrentLakalaWebhookJson(input);
    const normalized = normalizeCurrentLakalaWebhookPayload(payload);
    const verification = verifyLakalaSignature(this.paymentSettings, {
      authorization: input.authorization,
      rawBody: input.rawBody,
    });

    return this.buildWebhookResult(payload, normalized, verification);
  }

  // 将拉卡拉交易状态映射成平台内部 Webhook 状态
  private toGatewayWebhookStatus(status?: string): GatewayWebhookPaymentStatus {
    if (!status) {
      return 'UNKNOWN';
    }
    if (isLakalaSuccessStatus(status)) {
      return 'SUCCESS';
    }
    if (isLakalaFailureStatus(status)) {
      return 'FAILED';
    }
    return 'UNKNOWN';
  }

  // 组装平台内部 Webhook 结果，同时保留原始 payload 供审计记录落库
  private buildWebhookResult(
    payload: unknown,
    normalized: ReturnType<typeof normalizeCurrentLakalaWebhookPayload>,
    verification: { ok: boolean; reason?: string },
  ): NormalizedGatewayWebhook {
    let amount = decimal(0);
    let amountParseError: string | undefined;

    try {
      amount = parseLakalaAmount(normalized.amountFen);
    } catch (error) {
      amountParseError = error instanceof Error ? error.message : String(error);
    }

    return {
      channel: this.channel,
      gatewayTradeNo: normalized.gatewayTradeNo,
      status: this.toGatewayWebhookStatus(normalized.externalStatus),
      amount,
      amountParseError,
      paidAt: parseLakalaDateTime(normalized.paidAtRaw),
      failureMessage: normalized.failureMessage,
      rawExternalStatus: normalized.externalStatus,
      rawPayload: payload,
      normalizedPayload: normalized,
      signatureVerified: verification.ok,
      signatureFailureReason: verification.reason,
    };
  }
}
