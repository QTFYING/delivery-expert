import { CreditTypeEnum, OrderPayTypeEnum, type CreditType, type OrderPayType } from '@shou/types/enums';
import dayjs from 'dayjs';

export const CREDIT_TYPE_DEFAULT_DAYS: Record<CreditType, number> = {
  [CreditTypeEnum.MONTH]: 30,
  [CreditTypeEnum.WEEK]: 7,
  [CreditTypeEnum.PERIOD]: 30,
};

export interface NormalizedSettlementType {
  payType: OrderPayType;
  creditType: CreditType | null;
}

export function normalizeSettlementType(raw: unknown): NormalizedSettlementType | undefined {
  const resolved = normalizeSettlementText(raw);
  if (!resolved) {
    return undefined;
  }

  if (['cash', '现款', '现金', '滚结'].includes(resolved)) {
    return { payType: OrderPayTypeEnum.CASH, creditType: null };
  }

  if (['month', '月结'].includes(resolved)) {
    return { payType: OrderPayTypeEnum.CREDIT, creditType: CreditTypeEnum.MONTH };
  }

  if (['week', '周结'].includes(resolved)) {
    return { payType: OrderPayTypeEnum.CREDIT, creditType: CreditTypeEnum.WEEK };
  }

  if (['credit', '账期', '赊账', 'period'].includes(resolved)) {
    return { payType: OrderPayTypeEnum.CREDIT, creditType: CreditTypeEnum.PERIOD };
  }

  return undefined;
}

export function resolveCreditDays(creditType: CreditType | null): number | null {
  return creditType ? CREDIT_TYPE_DEFAULT_DAYS[creditType] : null;
}

export function resolveCreditDueDate(orderTime: Date, creditDays: number | null): Date | null {
  return creditDays === null ? null : dayjs(orderTime).add(creditDays, 'day').toDate();
}

function normalizeSettlementText(raw: unknown): string | undefined {
  if (raw === null || raw === undefined) {
    return undefined;
  }
  const value = String(raw).trim();
  return value ? value.toLowerCase() : undefined;
}
