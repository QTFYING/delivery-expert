import { BadRequestException } from '@nestjs/common';
import type {
  OrderImportDuplicateOrder,
  OrderImportPreviewError,
  OrderImportPreviewOrder,
  OrderImportPreviewSummary,
  OrderImportTemplateField,
  OrderLineItem,
} from '@shou/types/contracts';
import type { CreditType, OrderPayType } from '@shou/types/enums';
import Decimal from 'decimal.js';
import { cut, formatLocalDateTime, parseLocalDateTime } from '../common/validators';
import { normalizeSettlementType, resolveCreditDays, resolveCreditDueDate } from '../order/order-credit.domain';
import { readLocalDateTime, readMoney, readString } from './mapping/import.mapper';

export type ImportCustomerFieldMap = Map<string, OrderImportTemplateField>;
export type ImportFieldLabelMap = Map<string, string>;

class ImportLineItemFieldError extends BadRequestException {
  constructor(
    readonly fieldKey: string,
    message: string,
  ) {
    super(message);
  }
}

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
  creditType: CreditType | null;
  creditDays: number | null;
  creditDueDate: string | null;
  customerFieldValues: Record<string, string>;
  mappingTemplateId?: string;
  lineItems: OrderLineItem[];
}

export function normalizePreviewOrder(
  order: OrderImportPreviewOrder,
  index: number,
  templateId: string,
  listCustomerFieldMap: ImportCustomerFieldMap,
  lineCustomerFieldMap: ImportCustomerFieldMap,
  allCustomerFieldMap: ImportCustomerFieldMap,
  fieldLabelMap: ImportFieldLabelMap,
  valueRequiredMap: Map<string, boolean>,
): { value: PreparedImportOrder } | { error: OrderImportPreviewError[] } {
  const errors: OrderImportPreviewError[] = [];
  const sourceOrderNo = readString(order.sourceOrderNo);
  const customer = readString(order.customer);
  const customerPhone = readString(order.customerPhone) ?? null;
  const customerAddress = readString(order.customerAddress) ?? '';
  const groupKey = readString(order.groupKey) ?? sourceOrderNo;
  const totalAmount = readMoney(order.totalAmount);
  const orderTime = readLocalDateTime(order.orderTime);
  const settlementType = normalizeSettlementType(order.payType);
  const labelOf = (key: string): string => fieldLabelMap.get(key) ?? key;
  const hasInputValue = (value: unknown): boolean => readString(value) !== undefined;

  if (!sourceOrderNo) {
    errors.push({ index, field: 'sourceOrderNo', reason: `${labelOf('sourceOrderNo')}不能为空` });
  }

  const needValue = (key: string): boolean => valueRequiredMap.get(key) ?? false;

  if (needValue('customer') && !customer) {
    errors.push({ index, sourceOrderNo, field: 'customer', reason: `${labelOf('customer')}不能为空` });
  }
  if (needValue('customerAddress') && !customerAddress) {
    errors.push({ index, sourceOrderNo, field: 'customerAddress', reason: `${labelOf('customerAddress')}不能为空` });
  }
  if (needValue('totalAmount') && totalAmount === undefined) {
    const reason = hasInputValue(order.totalAmount) ? `${labelOf('totalAmount')}必须是合法数字` : `${labelOf('totalAmount')}不能为空`;
    errors.push({ index, sourceOrderNo, field: 'totalAmount', reason });
  } else if (totalAmount !== undefined && totalAmount.lt(0)) {
    errors.push({ index, sourceOrderNo, field: 'totalAmount', reason: `${labelOf('totalAmount')}不能小于 0` });
  }
  if (needValue('orderTime') && !orderTime) {
    const reason = hasInputValue(order.orderTime)
      ? `${labelOf('orderTime')}格式不正确，请使用 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss`
      : `${labelOf('orderTime')}不能为空`;
    errors.push({ index, sourceOrderNo, field: 'orderTime', reason });
  }
  if (needValue('payType') && !settlementType) {
    const reason = hasInputValue(order.payType)
      ? `${labelOf('payType')}不正确，仅支持 cash、credit、现款、现金、月结、周结、账期、赊账或滚结`
      : `${labelOf('payType')}不能为空`;
    errors.push({
      index,
      sourceOrderNo,
      field: 'payType',
      reason,
    });
  }

  const customerFieldValues = normalizeCustomerFieldValues(
    order.customerFieldValues,
    listCustomerFieldMap,
    allCustomerFieldMap,
    index,
    sourceOrderNo,
  );
  errors.push(...customerFieldValues.errors);

  const rawLineItems = order.lineItems ?? [];
  if (rawLineItems.length === 0) {
    errors.push({ index, sourceOrderNo, field: 'lineItems', reason: '订单明细至少需要一个商品' });
  }
  const lineItems = normalizeLineItems(
    rawLineItems,
    index,
    valueRequiredMap,
    lineCustomerFieldMap,
    allCustomerFieldMap,
    fieldLabelMap,
    sourceOrderNo,
  );
  errors.push(...lineItems.errors);

  if (errors.length > 0 || !sourceOrderNo || !customer || totalAmount === undefined || !orderTime || !settlementType) {
    return { error: errors };
  }

  const creditDays = resolveCreditDays(settlementType.creditType);
  const creditDueDate = resolveCreditDueDate(parsePreparedOrderTime(orderTime), creditDays);

  return {
    value: {
      index,
      sourceOrderNo,
      groupKey,
      customer,
      customerPhone,
      customerAddress,
      totalAmount: Number(totalAmount.toFixed(2)),
      orderTime,
      payType: settlementType.payType,
      creditType: settlementType.creditType,
      creditDays,
      creditDueDate: formatLocalDateTime(creditDueDate) ?? null,
      customerFieldValues: customerFieldValues.values,
      mappingTemplateId: templateId,
      lineItems: lineItems.values,
    },
  };
}

export function normalizeCustomerFieldValues(
  value: Record<string, string> | undefined,
  listCustomerFieldMap: ImportCustomerFieldMap,
  allCustomerFieldMap: ImportCustomerFieldMap,
  index: number,
  sourceOrderNo?: string,
): { values: Record<string, string>; errors: OrderImportPreviewError[] } {
  return normalizeScopedCustomerFieldValues(value, listCustomerFieldMap, allCustomerFieldMap, {
    index,
    sourceOrderNo,
    fieldPrefix: 'customerFieldValues',
    requiredReasonPrefix: '订单自定义字段',
    wrongScopeReason: (field) => `自定义字段「${getCustomerFieldLabel(field)}」属于商品行字段，应放在 lineItems[].customerFieldValues`,
  });
}

export function normalizeLineItems(
  lineItems: OrderLineItem[],
  index: number,
  valueRequiredMap: Map<string, boolean>,
  lineCustomerFieldMap: ImportCustomerFieldMap,
  allCustomerFieldMap: ImportCustomerFieldMap,
  fieldLabelMap: ImportFieldLabelMap,
  sourceOrderNo?: string,
): { values: OrderLineItem[]; errors: OrderImportPreviewError[] } {
  const errors: OrderImportPreviewError[] = [];
  const values: OrderLineItem[] = [];

  lineItems.forEach((item, itemIndex) => {
    try {
      const customerFieldValues = normalizeLineCustomerFieldValues(
        item.customerFieldValues,
        lineCustomerFieldMap,
        allCustomerFieldMap,
        index,
        itemIndex,
        sourceOrderNo,
      );
      errors.push(...customerFieldValues.errors);
      values.push({
        ...normalizeLineItem(item, valueRequiredMap, fieldLabelMap),
        customerFieldValues: Object.keys(customerFieldValues.values).length > 0 ? customerFieldValues.values : undefined,
      });
    } catch (error) {
      const fieldKey = error instanceof ImportLineItemFieldError ? error.fieldKey : undefined;
      const reason = error instanceof Error ? error.message : '订单明细格式不正确';
      errors.push({
        index,
        sourceOrderNo,
        field: fieldKey ? `lineItems[${itemIndex}].${fieldKey}` : `lineItems[${itemIndex}]`,
        reason: `第 ${itemIndex + 1} 条商品明细：${reason}`,
      });
    }
  });

  return { values, errors };
}

export function normalizeLineCustomerFieldValues(
  value: Record<string, string> | undefined,
  lineCustomerFieldMap: ImportCustomerFieldMap,
  allCustomerFieldMap: ImportCustomerFieldMap,
  index: number,
  itemIndex: number,
  sourceOrderNo?: string,
): { values: Record<string, string>; errors: OrderImportPreviewError[] } {
  return normalizeScopedCustomerFieldValues(value, lineCustomerFieldMap, allCustomerFieldMap, {
    index,
    sourceOrderNo,
    fieldPrefix: `lineItems[${itemIndex}].customerFieldValues`,
    requiredReasonPrefix: '商品行自定义字段',
    wrongScopeReason: (field) => `自定义字段「${getCustomerFieldLabel(field)}」属于订单级字段，应放在 customerFieldValues`,
  });
}

export function normalizeLineItem(item: OrderLineItem, valueRequiredMap: Map<string, boolean>, fieldLabelMap: ImportFieldLabelMap): OrderLineItem {
  const needValue = (key: string): boolean => valueRequiredMap.get(key) ?? false;
  const labelOf = (key: string): string => fieldLabelMap.get(key) ?? key;

  const readOptionalDecimal = (value: unknown, key: string, scale: number): Decimal | undefined => {
    if (value === null || value === undefined || value === '') return undefined;
    const numeric = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim());
    if (!Number.isFinite(numeric)) {
      throw new ImportLineItemFieldError(key, `${labelOf(key)}必须是合法数字`);
    }
    const parsed = new Decimal(String(numeric)).toDecimalPlaces(scale);
    if (parsed.lt(0)) {
      throw new ImportLineItemFieldError(key, `${labelOf(key)}必须大于等于 0`);
    }
    return parsed;
  };

  const quantity = readOptionalDecimal(item.quantity, 'quantity', 3);
  const unitPrice = readOptionalDecimal(item.unitPrice, 'unitPrice', 2);
  const lineAmount = readOptionalDecimal(item.lineAmount, 'lineAmount', 2);

  if (needValue('quantity') && quantity === undefined) {
    throw new ImportLineItemFieldError('quantity', `${labelOf('quantity')}不能为空`);
  }
  if (needValue('unitPrice') && unitPrice === undefined) {
    throw new ImportLineItemFieldError('unitPrice', `${labelOf('unitPrice')}不能为空`);
  }
  if (needValue('lineAmount') && lineAmount === undefined) {
    throw new ImportLineItemFieldError('lineAmount', `${labelOf('lineAmount')}不能为空`);
  }

  if (quantity !== undefined && unitPrice !== undefined && lineAmount !== undefined) {
    const expected = quantity.mul(unitPrice).toDecimalPlaces(2);
    if (!expected.equals(lineAmount)) {
      throw new ImportLineItemFieldError('lineAmount', `${labelOf('lineAmount')}必须等于${labelOf('quantity')} * ${labelOf('unitPrice')}`);
    }
  }

  const rawSkuName = item.skuName?.trim();
  if (needValue('skuName') && !rawSkuName) {
    throw new ImportLineItemFieldError('skuName', `${labelOf('skuName')}不能为空`);
  }

  const rawUnit = item.unit?.trim();
  if (needValue('unit') && !rawUnit) {
    throw new ImportLineItemFieldError('unit', `${labelOf('unit')}不能为空`);
  }

  const rawSkuSpec = item.skuSpec?.trim();
  if (needValue('skuSpec') && !rawSkuSpec) {
    throw new ImportLineItemFieldError('skuSpec', `${labelOf('skuSpec')}不能为空`);
  }

  const rawPackSpec = item.packSpec?.trim();
  if (needValue('packSpec') && !rawPackSpec) {
    throw new ImportLineItemFieldError('packSpec', `${labelOf('packSpec')}不能为空`);
  }

  return {
    itemId: item.itemId,
    skuId: item.skuId ?? null,
    skuName: rawSkuName ? cut(rawSkuName, 200) : '',
    skuSpec: rawSkuSpec ? cut(rawSkuSpec, 100) : undefined,
    unit: rawUnit ? cut(rawUnit, 20) : '',
    quantity: quantity !== undefined ? Number(quantity.toFixed(3)) : 0,
    packSpec: rawPackSpec ? cut(rawPackSpec, 50) : undefined,
    unitPrice: unitPrice !== undefined ? Number(unitPrice.toFixed(2)) : 0,
    lineAmount: lineAmount !== undefined ? Number(lineAmount.toFixed(2)) : 0,
  };
}

function normalizeScopedCustomerFieldValues(
  value: Record<string, string> | undefined,
  scopedFieldMap: ImportCustomerFieldMap,
  allCustomerFieldMap: ImportCustomerFieldMap,
  options: {
    index: number;
    sourceOrderNo?: string;
    fieldPrefix: string;
    requiredReasonPrefix: string;
    wrongScopeReason: (field: OrderImportTemplateField) => string;
  },
): { values: Record<string, string>; errors: OrderImportPreviewError[] } {
  const errors: OrderImportPreviewError[] = [];
  if (value !== undefined && value !== null && (typeof value !== 'object' || Array.isArray(value))) {
    return {
      values: {},
      errors: [
        {
          index: options.index,
          sourceOrderNo: options.sourceOrderNo,
          field: options.fieldPrefix,
          reason: `${options.requiredReasonPrefix}必须按对象传递，例如 {"cf1":"字段值"}`,
        },
      ],
    };
  }

  const source = value && typeof value === 'object' ? value : {};

  const values = Object.entries(source).reduce<Record<string, string>>((acc, [key, item]) => {
    const resolved = readString(item);
    const anyField = allCustomerFieldMap.get(key);
    if (!anyField) {
      errors.push({
        index: options.index,
        sourceOrderNo: options.sourceOrderNo,
        field: `${options.fieldPrefix}.${key}`,
        reason: `自定义字段 key 不存在：${key}，请使用当前导入模板返回的 customerFields[].key`,
      });
      return acc;
    }

    if (!scopedFieldMap.has(key)) {
      errors.push({
        index: options.index,
        sourceOrderNo: options.sourceOrderNo,
        field: `${options.fieldPrefix}.${key}`,
        reason: options.wrongScopeReason(anyField),
      });
      return acc;
    }

    if (resolved) {
      acc[key] = resolved;
    }
    return acc;
  }, {});

  scopedFieldMap.forEach((field, key) => {
    if ((field.isValueRequired ?? false) && !values[key]) {
      errors.push({
        index: options.index,
        sourceOrderNo: options.sourceOrderNo,
        field: `${options.fieldPrefix}.${key}`,
        reason: `${options.requiredReasonPrefix}「${getCustomerFieldLabel(field)}」不能为空`,
      });
    }
  });

  return { values, errors };
}

function getCustomerFieldLabel(field: OrderImportTemplateField): string {
  return readString(field.label) ?? field.key;
}

function parsePreparedOrderTime(value: string): Date {
  const parsed = parseLocalDateTime(value);
  if (!parsed) {
    throw new Error(`导入订单下单时间格式异常：${value}`);
  }
  return parsed;
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
