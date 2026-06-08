import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import dayjs from 'dayjs';
import { BusinessException } from '../common/exceptions/business.exception';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_QR_CODE_EXPIRY_DAYS, GENERAL_SETTINGS_CONFIG_GROUP } from '../settings/settings.constants';
import { parseNumberValue } from '../settings/mapping/settings.mapper';

type PaymentWindowClient = Prisma.TransactionClient | PrismaService;

export type PaymentWindowDecision = {
  isExpired: boolean;
  qrCodeExpiryDays: number;
  payableUntilAt: Date;
  expiredMessage: string | null;
};

@Injectable()
export class PaymentWindowService {
  constructor(private readonly prisma: PrismaService) {}

  /** 读取租户当前生效的订单可支付有效期天数 */
  async getTenantQrCodeExpiryDays(tenantId: string, client: PaymentWindowClient = this.prisma): Promise<number> {
    const [tenantOverride, platformDefault] = await Promise.all([
      client.tenantGeneralSettings.findUnique({
        where: { tenantId },
        select: { qrCodeExpiry: true },
      }),
      client.systemConfig.findUnique({
        where: {
          group_key: {
            group: GENERAL_SETTINGS_CONFIG_GROUP,
            key: 'qrCodeExpiry',
          },
        },
        select: { value: true },
      }),
    ]);

    return this.resolveQrCodeExpiryDays({
      tenantOverrideDays: tenantOverride?.qrCodeExpiry ?? null,
      platformDefaultValue: platformDefault?.value,
    });
  }

  /** 基于订单下单时间和租户当前有效期，统一裁决订单是否超过支付窗口 */
  async resolveOrderPaymentWindow(
    input: {
      tenantId: string;
      orderTime: Date;
      now?: Date;
    },
    client: PaymentWindowClient = this.prisma,
  ): Promise<PaymentWindowDecision> {
    const qrCodeExpiryDays = await this.getTenantQrCodeExpiryDays(input.tenantId, client);
    return this.resolvePaymentWindow({
      windowStartedAt: input.orderTime,
      qrCodeExpiryDays,
      now: input.now,
    });
  }

  /**
   * 当订单超过租户支付有效期时统一抛出业务错误
   * 用于支付发起和线下登记等写操作的服务端兜底门禁
   */
  async assertOrderWithinPaymentWindow(
    input: {
      tenantId: string;
      orderTime: Date;
      now?: Date;
    },
    client: PaymentWindowClient = this.prisma,
  ): Promise<void> {
    const decision = await this.resolveOrderPaymentWindow(input, client);
    if (!decision.isExpired) {
      return;
    }

    throw new BusinessException(1005, decision.expiredMessage ?? this.buildExpiredMessage(decision.qrCodeExpiryDays), 409);
  }

  /** 归一化 qrCodeExpiry 配置值，保证支付窗口至少为 1 天 */
  resolveQrCodeExpiryDays(input: { tenantOverrideDays?: number | null; platformDefaultValue?: string }): number {
    const rawValue =
      typeof input.tenantOverrideDays === 'number'
        ? input.tenantOverrideDays
        : parseNumberValue(input.platformDefaultValue, DEFAULT_QR_CODE_EXPIRY_DAYS);

    if (!Number.isFinite(rawValue)) {
      return DEFAULT_QR_CODE_EXPIRY_DAYS;
    }

    return Math.max(1, Math.floor(rawValue));
  }

  /** 基于订单下单时间计算支付窗口边界和超期提示 */
  resolvePaymentWindow(input: { windowStartedAt: Date; qrCodeExpiryDays: number; now?: Date }): PaymentWindowDecision {
    const now = input.now ?? new Date();
    const qrCodeExpiryDays = this.resolveQrCodeExpiryDays({
      tenantOverrideDays: input.qrCodeExpiryDays,
    });
    const payableUntilAt = dayjs(input.windowStartedAt).add(qrCodeExpiryDays, 'day').toDate();
    const isExpired = now.getTime() >= payableUntilAt.getTime();

    return {
      isExpired,
      qrCodeExpiryDays,
      payableUntilAt,
      expiredMessage: isExpired ? this.buildExpiredMessage(qrCodeExpiryDays) : null,
    };
  }

  /** 生成订单超过支付有效期的统一提示文案 */
  buildExpiredMessage(qrCodeExpiryDays: number): string {
    return `订单已超过商户设置的支付有效期（${qrCodeExpiryDays}天），请联系商户处理`;
  }
}
