import { PaymentChannelEnum as PrismaPaymentChannelEnum } from '@prisma/client';
import type Decimal from 'decimal.js';

export type GatewayWebhookPaymentStatus = 'SUCCESS' | 'FAILED' | 'UNKNOWN';

export type CreateCounterPaymentInput = {
  orderId: string;
  orderDescription: string;
  gatewayTradeNo: string;
  amount: Decimal;
  config: Record<string, unknown>;
};

export type CreateCounterPaymentResult = {
  gatewayTradeNo: string;
  cashierUrl: string;
  cashierExpiresAt: Date;
};

export type PaymentGatewayWebhookInput = {
  rawBody: string;
  contentType?: string;
  authorization?: string;
  headerSnapshot: Record<string, unknown>;
};

export type NormalizedGatewayWebhook = {
  channel: PrismaPaymentChannelEnum;
  gatewayTradeNo?: string;
  status: GatewayWebhookPaymentStatus;
  amount: Decimal;
  amountParseError?: string;
  paidAt?: Date;
  failureMessage?: string;
  rawExternalStatus?: string;
  rawPayload?: unknown;
  normalizedPayload?: unknown;
  signatureVerified: boolean;
  signatureFailureReason?: string;
};

export interface PaymentGatewayProvider {
  readonly channel: PrismaPaymentChannelEnum;

  generateTradeNo(): string;

  createCounterPayment(input: CreateCounterPaymentInput): Promise<CreateCounterPaymentResult>;

  verifyAndNormalizeWebhook(input: PaymentGatewayWebhookInput): NormalizedGatewayWebhook;
}
