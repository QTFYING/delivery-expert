export const ERP_VENDOR_OPTIONS = [
  { code: 'kingdee', name: '金蝶' },
  { code: 'yonyou', name: '用友' },
] as const;

export const ERP_VENDOR_CODE_MAP = new Map(ERP_VENDOR_OPTIONS.map((v) => [v.code, v.name]));

export const ERP_VENDOR_NAME_BY_CODE: Record<string, string> = Object.fromEntries(ERP_VENDOR_OPTIONS.map((v) => [v.code, v.name]));

export function isValidErpVendorCode(code: string): boolean {
  return ERP_VENDOR_CODE_MAP.has(code as (typeof ERP_VENDOR_OPTIONS)[number]['code']);
}

export const PRINTING_TEMPLATE_PACKAGE_ID_PREFIX = 'PTP';
export const PRINTING_TEMPLATE_PACKAGE_ID_DIGITS = 6;
