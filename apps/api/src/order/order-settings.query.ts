import { GENERAL_SETTINGS_DEFAULTS } from '../settings/settings.constants';

type TenantGeneralSettingsReader = {
  findUnique(args: {
    where: { tenantId: string };
    select: { creditRemindDays: true };
  }): Promise<{ creditRemindDays: number | null } | null>;
};

export async function getTenantCreditRemindDays(client: { tenantGeneralSettings: TenantGeneralSettingsReader }, tenantId: string): Promise<number> {
  const settings = await client.tenantGeneralSettings.findUnique({
    where: { tenantId },
    select: { creditRemindDays: true },
  });

  return settings?.creditRemindDays ?? GENERAL_SETTINGS_DEFAULTS.creditRemindDays;
}
