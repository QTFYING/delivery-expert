import { Injectable } from '@nestjs/common';
import { PaymentWebhookEventStatusEnum as PrismaPaymentWebhookEventStatusEnum, type Prisma } from '@prisma/client';
import { cut } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';

type PaymentWebhookEventUpdate = {
  tenantId?: string | null;
  orderId?: string | null;
  paymentOrderId?: string | null;
  gatewayTradeNo?: string | null;
  externalStatus?: string | null;
  signatureVerified?: boolean | null;
  processingStatus?: PrismaPaymentWebhookEventStatusEnum;
  reason?: string | null;
  payload?: unknown;
  normalized?: unknown;
  processedAt?: Date | null;
};

@Injectable()
export class PaymentWebhookAuditService {
  constructor(private readonly prisma: PrismaService) {}

  // 创建 Webhook 原始事件，先保留入口证据，不参与业务状态裁决
  async createLakalaEvent(input: { rawBody: string; headers: unknown }) {
    return this.prisma.paymentWebhookEvent.create({
      data: {
        provider: 'lakala',
        rawBody: input.rawBody || null,
        headers: toJson(input.headers),
      },
    });
  }

  // 更新事件处理结果；可在主事务内传入 tx，也可用于事务外失败记录
  async updateEvent(eventId: string, input: PaymentWebhookEventUpdate, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;

    return client.paymentWebhookEvent.updateMany({
      where: { id: eventId },
      data: {
        tenantId: input.tenantId,
        orderId: input.orderId,
        paymentOrderId: input.paymentOrderId,
        gatewayTradeNo: input.gatewayTradeNo,
        externalStatus: input.externalStatus,
        signatureVerified: input.signatureVerified,
        processingStatus: input.processingStatus,
        reason: input.reason === undefined ? undefined : input.reason === null ? null : cut(input.reason, 255),
        payload: input.payload === undefined ? undefined : toJson(input.payload),
        normalized: input.normalized === undefined ? undefined : toJson(input.normalized),
        processedAt: input.processedAt,
      },
    });
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}
