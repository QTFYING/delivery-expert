import { ForbiddenException } from '@nestjs/common';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { toDecimalNumber } from '../common/money';

type PaymentOrderSummaryLineItem = {
  skuName: string;
  quantity: Parameters<typeof toDecimalNumber>[0];
};

export function getPaymentTenantId(currentUser: JwtPayload): string {
  if (!currentUser.tenantId) {
    throw new ForbiddenException('当前登录态不属于租户侧，无法操作支付功能');
  }

  return currentUser.tenantId;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function buildPaymentOrderSummary(lineItems: PaymentOrderSummaryLineItem[]): string {
  if (lineItems.length === 0) {
    return '订单商品';
  }

  const [first, ...rest] = lineItems;
  const firstQuantity = toDecimalNumber(first.quantity, 3);
  const quantityText = Number.isInteger(firstQuantity) ? String(firstQuantity) : firstQuantity.toFixed(3);
  return rest.length > 0 ? `${first.skuName}×${quantityText}等${lineItems.length}件` : `${first.skuName}×${quantityText}`;
}

export function buildGatewayTradeNo(orderId: string, onlineAttemptNo: number): string {
  return `${orderId}_${String(onlineAttemptNo).padStart(2, '0')}`;
}
