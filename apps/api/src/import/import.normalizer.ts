import { BadRequestException } from '@nestjs/common';
import type {
  OrderImportDuplicateOrder,
  OrderImportPreviewError,
  OrderImportPreviewOrder,
  OrderImportPreviewSummary,
  OrderLineItem,
} from '@shou/types/contracts';
import type { OrderPayType } from '@shou/types/enums';
import Decimal from 'decimal.js';
import { cut } from '../common/validators';
import { readDate, readMoney, readPayType, readString } from './mapping/import.mapper';

export interface PreparedImportOrder {
  index: number;
  sourceOrderNo: string;
  groupKey?: string;
  customer: string;
  customerPhone: string | null;
  customerAddress: string;
  totalAmount: number;
  orderTime: string;
  payType: OrderPayType;
  customerFieldValues: Record<string, string>;
  mappingTemplateId?: string;
  lineItems: OrderLineItem[];
}

export function normalizePreviewOrder(
  order: OrderImportPreviewOrder,
  index: number,
  templateId: string,
  customerFieldKeySet: Set<string>,
  valueRequiredMap: Map<string, boolean>,
): { value: PreparedImportOrder } | { error: OrderImportPreviewError[] } {
  const errors: OrderImportPreviewError[] = [];
  const sourceOrderNo = readString(order.sourceOrderNo);
  const customer = readString(order.customer);
  const customerPhone = readString(order.customerPhone) ?? null;
  const customerAddress = readString(order.customerAddress);
  const groupKey = readString(order.groupKey) ?? sourceOrderNo;
  const totalAmount = readMoney(order.totalAmount);
  const orderTime = readDate(order.orderTime);
  const payType = readPayType(order.payType);

  if (!sourceOrderNo) {
    errors.push({ index, field: 'sourceOrderNo', reason: '源订单号不能为空' });
  }

  const needValue = (key: string): boolean => valueRequiredMap.get(key) ?? false;

  if (needValue('customer') && !customer) {
    errors.push({ index, sourceOrderNo, field: 'customer', reason: '客户名称不能为空' });
  }
  if (needValue('customerAddress') && !customerAddress) {
    errors.push({ index, sourceOrderNo, field: 'customerAddress', reason: '客户地址不能为空' });
  }
  if (needValue('totalAmount') && totalAmount === undefined) {
    errors.push({ index, sourceOrderNo, field: 'totalAmount', reason: '总金额不能为空' });
  } else if (totalAmount !== undefined && totalAmount.lt(0)) {
    errors.push({ index, sourceOrderNo, field: 'totalAmount', reason: '总金额不能小于 0' });
  }
  if (needValue('orderTime') && !orderTime) {
    errors.push({ index, sourceOrderNo, field: 'orderTime', reason: '下单时间格式不正确' });
  }
  if (needValue('payType') && !payType) {
    errors.push({
      index,
      sourceOrderNo,
      field: 'payType',
      reason: '结算方式不正确，仅支持 cash 或 credit',
    });
  }

  const customerFieldValues = normalizeCustomerFieldValues(order.customerFieldValues, customerFieldKeySet, valueRequiredMap, index, sourceOrderNo);
  errors.push(...customerFieldValues.errors);

  const rawLineItems = order.lineItems ?? [];
  if (rawLineItems.length === 0) {
    errors.push({ index, sourceOrderNo, field: 'lineItems', reason: '订单明细至少需要一个商品' });
  }
  const lineItems = normalizeLineItems(rawLineItems, index, valueRequiredMap, sourceOrderNo);
  errors.push(...lineItems.errors);

  if (errors.length > 0 || !sourceOrderNo || !customer || !customerAddress || !totalAmount || !orderTime || !payType) {
    return { error: errors };
  }

  return {
    value: {
      index,
      sourceOrderNo,
      groupKey,
      customer,
      customerPhone,
      customerAddress,
      totalAmount: Number(totalAmount.toFixed(2)),
      orderTime: orderTime.toISOString(),
      payType,
      customerFieldValues: customerFieldValues.values,
      mappingTemplateId: templateId,
      lineItems: lineItems.values,
    },
  };
}

export function normalizeCustomerFieldValues(
  value: Record<string, string> | undefined,
  customerFieldKeySet: Set<string>,
  valueRequiredMap: Map<string, boolean>,
  index: number,
  sourceOrderNo?: string,
): { values: Record<string, string>; errors: OrderImportPreviewError[] } {
  const errors: OrderImportPreviewError[] = [];
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  const values = Object.entries(source).reduce<Record<string, string>>((acc, [key, item]) => {
    const resolved = readString(item);
    if (!customerFieldKeySet.has(key)) {
      errors.push({
        index,
        sourceOrderNo,
        field: 'customerFieldValues',
        reason: `自定义字段 key 不存在：${key}`,
      });
      return acc;
    }

    if (resolved) {
      acc[key] = resolved;
    }
    return acc;
  }, {});

  customerFieldKeySet.forEach((key) => {
    if ((valueRequiredMap.get(key) ?? false) && !values[key]) {
      errors.push({
        index,
        sourceOrderNo,
        field: `customerFieldValues.${key}`,
        reason: `自定义字段 ${key} 不能为空`,
      });
    }
  });

  return { values, errors };
}

export function normalizeLineItems(
  lineItems: OrderLineItem[],
  index: number,
  valueRequiredMap: Map<string, boolean>,
  sourceOrderNo?: string,
): { values: OrderLineItem[]; errors: OrderImportPreviewError[] } {
  const errors: OrderImportPreviewError[] = [];
  const values: OrderLineItem[] = [];

  lineItems.forEach((item, itemIndex) => {
    try {
      values.push(normalizeLineItem(item, valueRequiredMap));
    } catch (error) {
      errors.push({
        index,
        sourceOrderNo,
        field: `lineItems[${itemIndex}]`,
        reason: error instanceof Error ? error.message : '订单明细格式不正确',
      });
    }
  });

  return { values, errors };
}

export function normalizeLineItem(item: OrderLineItem, valueRequiredMap: Map<string, boolean>): OrderLineItem {
  const needValue = (key: string): boolean => valueRequiredMap.get(key) ?? false;

  const readOptionalDecimal = (value: unknown, label: string, scale: number): Decimal | undefined => {
    if (value === null || value === undefined || value === '') return undefined;
    const numeric = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim());
    if (!Number.isFinite(numeric)) {
      throw new BadRequestException(`${label} 必须是合法数字`);
    }
    const parsed = new Decimal(String(numeric)).toDecimalPlaces(scale);
    if (parsed.lt(0)) {
      throw new BadRequestException(`${label} 必须大于等于 0`);
    }
    return parsed;
  };

  const quantity = readOptionalDecimal(item.quantity, 'quantity', 3);
  const unitPrice = readOptionalDecimal(item.unitPrice, 'unitPrice', 2);
  const lineAmount = readOptionalDecimal(item.lineAmount, 'lineAmount', 2);

  if (needValue('quantity') && quantity === undefined) {
    throw new BadRequestException('quantity 不能为空');
  }
  if (needValue('unitPrice') && unitPrice === undefined) {
    throw new BadRequestException('unitPrice 不能为空');
  }
  if (needValue('lineAmount') && lineAmount === undefined) {
    throw new BadRequestException('lineAmount 不能为空');
  }

  if (quantity !== undefined && unitPrice !== undefined && lineAmount !== undefined) {
    const expected = quantity.mul(unitPrice).toDecimalPlaces(2);
    if (!expected.equals(lineAmount)) {
      throw new BadRequestException('lineAmount 必须等于 quantity * unitPrice');
    }
  }

  const rawSkuName = item.skuName?.trim();
  if (needValue('skuName') && !rawSkuName) {
    throw new BadRequestException('skuName 不能为空');
  }

  const rawUnit = item.unit?.trim();
  if (needValue('unit') && !rawUnit) {
    throw new BadRequestException('unit 不能为空');
  }

  const rawSkuSpec = item.skuSpec?.trim();
  if (needValue('skuSpec') && !rawSkuSpec) {
    throw new BadRequestException('skuSpec 不能为空');
  }

  return {
    itemId: item.itemId,
    skuId: item.skuId ?? null,
    skuName: rawSkuName ? cut(rawSkuName, 200) : '',
    skuSpec: rawSkuSpec ? cut(rawSkuSpec, 100) : undefined,
    unit: rawUnit ? cut(rawUnit, 20) : '',
    quantity: quantity !== undefined ? Number(quantity.toFixed(3)) : 0,
    unitPrice: unitPrice !== undefined ? Number(unitPrice.toFixed(2)) : 0,
    lineAmount: lineAmount !== undefined ? Number(lineAmount.toFixed(2)) : 0,
  };
}

export function buildPreviewSummary(
  totalOrders: number,
  orders: PreparedImportOrder[],
  invalidOrders: OrderImportPreviewError[],
  duplicateOrders: OrderImportDuplicateOrder[],
): OrderImportPreviewSummary {
  const invalidOrderCount = new Set(invalidOrders.map((item) => item.index)).size;
  return {
    totalOrders,
    validOrders: orders.length,
    invalidOrders: invalidOrderCount,
    duplicateOrderCount: uniqueDuplicateOrders(duplicateOrders).length,
    errorCount: invalidOrders.length,
  };
}

export function uniqueDuplicateOrders(duplicateOrders: OrderImportDuplicateOrder[]): OrderImportDuplicateOrder[] {
  const seen = new Set<string>();
  return duplicateOrders.filter((item) => {
    if (seen.has(item.sourceOrderNo)) {
      return false;
    }
    seen.add(item.sourceOrderNo);
    return true;
  });
}
