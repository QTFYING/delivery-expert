import type { TenantGeneralSettings } from '@shou/types/contracts';

export const GENERAL_SETTINGS_CONFIG_GROUP = 'tenant_general_defaults';

export const GENERAL_SETTINGS_DEFAULTS: TenantGeneralSettings = {
  qrCodeExpiry: 30,
  notifySeller: true,
  notifyOwner: true,
  notifyFinance: true,
  creditRemindDays: 3,
  dailyReportPush: true,
};

export const DEFAULT_QR_CODE_EXPIRY_DAYS = GENERAL_SETTINGS_DEFAULTS.qrCodeExpiry;
