import type { OrderImportTemplateField } from '@shou/types/contracts';

export const DEFAULT_TEMPLATE_FIELDS: OrderImportTemplateField[] = [
  { label: '源订单号', key: 'sourceOrderNo', mapStr: '', isRequired: true, isValueRequired: true, type: 'list' },
  { label: '客户名称', key: 'customer', mapStr: '', isRequired: true, isValueRequired: true, type: 'list' },
  { label: '客户电话', key: 'customerPhone', mapStr: '', isRequired: false, isValueRequired: false, type: 'list' },
  { label: '客户地址', key: 'customerAddress', mapStr: '', isRequired: false, isValueRequired: true, type: 'list' },
  { label: '总金额', key: 'totalAmount', mapStr: '', isRequired: false, isValueRequired: true, type: 'list' },
  { label: '下单时间', key: 'orderTime', mapStr: '', isRequired: true, isValueRequired: true, type: 'list' },
  { label: '结算方式', key: 'payType', mapStr: '', isRequired: false, isValueRequired: true, type: 'list' },
  { label: '品名', key: 'skuName', mapStr: '', isRequired: false, isValueRequired: false, type: 'line' },
  { label: '规格', key: 'skuSpec', mapStr: '', isRequired: false, isValueRequired: false, type: 'line' },
  { label: '单位', key: 'unit', mapStr: '', isRequired: false, isValueRequired: false, type: 'line' },
  { label: '数量', key: 'quantity', mapStr: '', isRequired: false, isValueRequired: false, type: 'line' },
  { label: '包装规格', key: 'packSpec', mapStr: '', isRequired: false, isValueRequired: false, type: 'line' },
  { label: '单价', key: 'unitPrice', mapStr: '', isRequired: false, isValueRequired: false, type: 'line' },
  { label: '金额', key: 'lineAmount', mapStr: '', isRequired: false, isValueRequired: false, type: 'line' },
];

const DEFAULT_TEMPLATE_FIELD_VALUE_REQUIRED = new Map(DEFAULT_TEMPLATE_FIELDS.map((field) => [field.key, field.isValueRequired ?? field.isRequired]));

export function cloneDefaultTemplateFields(): OrderImportTemplateField[] {
  return DEFAULT_TEMPLATE_FIELDS.map((field) => ({ ...field }));
}

export function resolveDefaultTemplateFieldValueRequired(field: OrderImportTemplateField): boolean {
  return DEFAULT_TEMPLATE_FIELD_VALUE_REQUIRED.get(field.key) ?? field.isValueRequired ?? field.isRequired;
}
