import { PaymentChannelEnum as PrismaPaymentChannelEnum } from '@prisma/client';
import type Decimal from 'decimal.js';

export type PreparedOnlinePaymentAttempt = {
  paymentOrderId: string;
  orderId: string;
  tenantId: string;
  gatewayTradeNo: string;
  orderDescription: string;
  payableAmount: Decimal;
  channel: PrismaPaymentChannelEnum;
  channelConfig: Record<string, unknown>;
};

export type ActivatedOnlinePaymentAttempt = PreparedOnlinePaymentAttempt & {
  cashierUrl: string;
  cashierExpiresAt: Date;
};
