import {
  Prisma,
  OrderCreditTypeEnum as PrismaOrderCreditTypeEnum,
  OrderPayTypeEnum as PrismaOrderPayTypeEnum,
  OrderStatusEnum as PrismaOrderStatusEnum,
} from '@prisma/client';
import { OrderStatusEnum, type OrderSearchStatus } from '@shou/types/enums';
import { businessInstantToLocalTimestampCarrierDayStart } from '../common/business-time';
import { DEFAULT_QR_CODE_EXPIRY_DAYS } from '../settings/settings.constants';

export type TenantPaymentWindowRule = {
  tenantId: string;
  qrCodeExpiryDays: number;
};

// 将订单搜索状态转换为查询条件；partial/voided 本期不开放搜索
export function buildOrderSearchStatusWhere(
  status?: OrderSearchStatus,
  options: { tenantPaymentWindows?: TenantPaymentWindowRule[] } = {},
): Prisma.OrderWhereInput | undefined {
  if (!status) {
    return undefined;
  }

  if (status === OrderStatusEnum.PAID) {
    return { status: PrismaOrderStatusEnum.PAID, voided: false };
  }

  const expiredWhere = buildExpiredOrderWhere(new Date(), options.tenantPaymentWindows ?? []);
  if (status === OrderStatusEnum.EXPIRED) {
    return expiredWhere;
  }

  return {
    status: PrismaOrderStatusEnum.PENDING,
    voided: false,
    NOT: expiredWhere,
  };
}

// 已过期包含持久化过期、现款超过租户支付有效期、账期超过到期日；作废不作为本期搜索条件
export function buildExpiredOrderWhere(date: Date, tenantPaymentWindows: TenantPaymentWindowRule[] = []): Prisma.OrderWhereInput {
  return {
    OR: [
      { status: PrismaOrderStatusEnum.EXPIRED, voided: false },
      buildExpiredCashOrderWhere(date, tenantPaymentWindows),
      buildExpiredCreditOrderWhere(date),
    ],
  };
}

function buildExpiredCashOrderWhere(date: Date, tenantPaymentWindows: TenantPaymentWindowRule[]): Prisma.OrderWhereInput {
  if (tenantPaymentWindows.length === 0) {
    return buildExpiredCashOrderByWindow(date, DEFAULT_QR_CODE_EXPIRY_DAYS);
  }

  return {
    OR: tenantPaymentWindows.map((rule) => buildExpiredCashOrderByWindow(date, rule.qrCodeExpiryDays, rule.tenantId)),
  };
}

function buildExpiredCashOrderByWindow(date: Date, qrCodeExpiryDays: number, tenantId?: string): Prisma.OrderWhereInput {
  const expiredBefore = getCashOrderExpiredBefore(date, qrCodeExpiryDays);
  return {
    ...(tenantId ? { tenantId } : {}),
    payType: PrismaOrderPayTypeEnum.CASH,
    status: PrismaOrderStatusEnum.PENDING,
    voided: false,
    orderTime: { lt: expiredBefore },
  };
}

function buildExpiredCreditOrderWhere(date: Date): Prisma.OrderWhereInput {
  return {
    payType: PrismaOrderPayTypeEnum.CREDIT,
    status: PrismaOrderStatusEnum.PENDING,
    voided: false,
    OR: buildCreditDueDateBeforeWhere(date),
  };
}

function buildCreditDueDateBeforeWhere(date: Date): Prisma.OrderWhereInput[] {
  return [
    { creditDueDate: { lt: date } },
    {
      creditDueDate: null,
      creditDays: { not: null },
      orderTime: { lt: businessInstantToLocalTimestampCarrierDayStart(date, -7) },
      creditType: PrismaOrderCreditTypeEnum.WEEK,
    },
    {
      creditDueDate: null,
      creditDays: { not: null },
      orderTime: { lt: businessInstantToLocalTimestampCarrierDayStart(date, -30) },
      creditType: { in: [PrismaOrderCreditTypeEnum.MONTH, PrismaOrderCreditTypeEnum.PERIOD] },
    },
    {
      creditDueDate: null,
      creditDays: null,
      orderTime: { lt: businessInstantToLocalTimestampCarrierDayStart(date, -30) },
    },
  ];
}

function normalizeExpiryDays(days: number): number {
  return Number.isFinite(days) ? Math.max(1, Math.floor(days)) : DEFAULT_QR_CODE_EXPIRY_DAYS;
}

function getCashOrderExpiredBefore(date: Date, qrCodeExpiryDays: number): Date {
  const days = normalizeExpiryDays(qrCodeExpiryDays);
  return businessInstantToLocalTimestampCarrierDayStart(date, -(days - 1));
}
