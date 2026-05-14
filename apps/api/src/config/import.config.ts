import { registerAs } from '@nestjs/config';

export const importConfig = registerAs('import', () => {
  const activeJobTenantTtlSeconds = Number.parseInt(process.env.IMPORT_ACTIVE_JOB_TENANT_TTL_SECONDS ?? '900', 10);
  const activeJobTenantRenewIntervalSeconds = Number.parseInt(process.env.IMPORT_ACTIVE_JOB_TENANT_RENEW_INTERVAL_SECONDS ?? '60', 10);

  return {
    workerEnabled: process.env.IMPORT_JOB_WORKER_ENABLED === 'true',
    activeJobTenantTtlSeconds,
    activeJobTenantRenewIntervalSeconds,
  };
});
