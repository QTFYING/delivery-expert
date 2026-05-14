import Decimal from 'decimal.js';

/**
 * Validates if the string is a valid amount format
 */
export const isValidAmount = (val: string): boolean => {
  try {
    const decimal = new Decimal(val);
    return decimal.isFinite() && decimal.gt(0);
  } catch {
    return false;
  }
};

/**
 * Validate identity: totalAmount = paidAmount + discountAmount
 */
export const validateOrderEquation = (totalAmount: string, paidAmount: string, discountAmount: string): boolean => {
  try {
    const total = new Decimal(totalAmount || '0');
    const paid = new Decimal(paidAmount || '0');
    const discount = new Decimal(discountAmount || '0');
    return total.eq(paid.plus(discount));
  } catch {
    return false;
  }
};

/**
 * Format string amount for UI display
 */
export const formatAmount = (val: string | null | undefined): string => {
  if (!val) return '0.00';
  try {
    const decimal = new Decimal(val);
    if (!decimal.isFinite()) return '0.00';
    return decimal.toFixed(2);
  } catch {
    return '0.00';
  }
};
