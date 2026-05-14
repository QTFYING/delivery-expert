import type { CreditOrderStatus, OrderPayType, OrderStatus } from '@shou/types/enums';
import Decimal from 'decimal.js';
import dayjs from 'dayjs';

export function deriveOrderStatus(payType: OrderPayType, amount: Decimal.Value, paid: Decimal.Value, voided: boolean): OrderStatus {
  const amountDecimal = new Decimal(amount);
  const paidDecimal = new Decimal(paid);

  if (voided) return 'expired';
  if (amountDecimal.gt(0) && paidDecimal.gte(amountDecimal)) return 'paid';
  if (paidDecimal.gt(0)) return 'partial';
  if (payType === 'credit') return 'credit';
  return 'pending';
}

export function resolveCreditOrderStatus(dueDate: Date, now: Date = new Date()): CreditOrderStatus {
  const currentDay = dayjs(now).startOf('day');
  const targetDay = dayjs(dueDate).startOf('day');

  if (targetDay.isBefore(currentDay)) return 'overdue';
  if (targetDay.isSame(currentDay)) return 'today';
  if (targetDay.diff(currentDay, 'day') <= 7) return 'soon';
  return 'normal';
}
