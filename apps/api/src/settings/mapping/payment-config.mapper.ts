import {
  PaymentChannelEnum as PrismaPaymentChannelEnum,
  TenantPaymentConfigStoredStatusEnum as PrismaTenantPaymentConfigStoredStatusEnum,
  TenantStatusEnum as PrismaTenantStatusEnum,
} from '@prisma/client';
import type { TenantPaymentConfigListItem, TenantPaymentConfigSnapshot } from '@shou/types/contracts';
import { PaymentChannelEnum, TenantPaymentConfigStatusEnum, TenantStatusEnum, type PaymentChannel, type TenantStatus } from '@shou/types/enums';

type TenantPaymentConfigRecord = {
  tenantId: string;
  channel: PrismaPaymentChannelEnum;
  status: PrismaTenantPaymentConfigStoredStatusEnum;
  configJson: unknown;
  invalidReason: string | null;
  lastValidatedAt: Date | null;
  updatedAt: Date;
  updatedBy: string | null;
};

type TenantSummaryRecord = {
  id: string;
  name: string;
  status: PrismaTenantStatusEnum;
  activePaymentChannel: PrismaPaymentChannelEnum | null;
};

const PAYMENT_CHANNEL_FROM_PRISMA: Record<PrismaPaymentChannelEnum, PaymentChannel> = {
  [PrismaPaymentChannelEnum.LAKALA]: PaymentChannelEnum.LAKALA,
  [PrismaPaymentChannelEnum.SHOUQIANBA]: PaymentChannelEnum.SHOUQIANBA,
  [PrismaPaymentChannelEnum.PINGAN_BANK]: PaymentChannelEnum.PINGAN_BANK,
};

const TENANT_PAYMENT_CONFIG_STATUS_FROM_PRISMA: Record<PrismaTenantPaymentConfigStoredStatusEnum, TenantPaymentConfigSnapshot['status']> = {
  [PrismaTenantPaymentConfigStoredStatusEnum.PENDING_VALIDATION]: TenantPaymentConfigStatusEnum.PENDING_VALIDATION,
  [PrismaTenantPaymentConfigStoredStatusEnum.AVAILABLE]: TenantPaymentConfigStatusEnum.AVAILABLE,
  [PrismaTenantPaymentConfigStoredStatusEnum.DISABLED]: TenantPaymentConfigStatusEnum.DISABLED,
  [PrismaTenantPaymentConfigStoredStatusEnum.INVALID]: TenantPaymentConfigStatusEnum.INVALID,
};

const TENANT_STATUS_FROM_PRISMA: Record<PrismaTenantStatusEnum, TenantStatus> = {
  [PrismaTenantStatusEnum.ACTIVE]: TenantStatusEnum.ACTIVE,
  [PrismaTenantStatusEnum.ONBOARDING]: TenantStatusEnum.ONBOARDING,
  [PrismaTenantStatusEnum.ATTENTION]: TenantStatusEnum.ATTENTION,
  [PrismaTenantStatusEnum.PAUSED]: TenantStatusEnum.PAUSED,
};

/** 将时间字段转换为 ISO 字符串 */
function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/** 将 Prisma 支付渠道映射为共享闭集 */
export function toContractChannel(channel: PrismaPaymentChannelEnum): PaymentChannel {
  return PAYMENT_CHANNEL_FROM_PRISMA[channel];
}

/** 将持久化配置状态映射为对外配置状态 */
function toContractStatus(status: PrismaTenantPaymentConfigStoredStatusEnum): TenantPaymentConfigSnapshot['status'] {
  return TENANT_PAYMENT_CONFIG_STATUS_FROM_PRISMA[status];
}

/** 构造已配置渠道的列表摘要 */
export function buildTenantPaymentConfigListItem(tenant: TenantSummaryRecord, config: TenantPaymentConfigRecord): TenantPaymentConfigListItem {
  return {
    channel: toContractChannel(config.channel),
    tenantId: tenant.id,
    tenantName: tenant.name,
    status: toContractStatus(config.status),
    invalidReason: config.invalidReason,
    lastValidatedAt: toIsoString(config.lastValidatedAt),
    updatedAt: config.updatedAt.toISOString(),
    updatedBy: config.updatedBy,
    tenantStatus: TENANT_STATUS_FROM_PRISMA[tenant.status] ?? TenantStatusEnum.ACTIVE,
  };
}

/** 构造未配置渠道的虚拟列表摘要 */
export function buildTenantPaymentConfigListItemForMissing(tenant: TenantSummaryRecord, channel: PaymentChannel): TenantPaymentConfigListItem {
  return {
    channel,
    tenantId: tenant.id,
    tenantName: tenant.name,
    status: TenantPaymentConfigStatusEnum.NOT_CONFIGURED,
    invalidReason: null,
    lastValidatedAt: null,
    updatedAt: null,
    updatedBy: null,
    tenantStatus: TENANT_STATUS_FROM_PRISMA[tenant.status],
  };
}

/** 构造支付渠道配置详情快照 */
export function buildTenantPaymentConfigSnapshot(
  tenant: TenantSummaryRecord,
  channel: PaymentChannel,
  config: TenantPaymentConfigRecord | null,
): TenantPaymentConfigSnapshot {
  if (!config) {
    return {
      channel,
      tenantId: tenant.id,
      tenantName: tenant.name,
      status: TenantPaymentConfigStatusEnum.NOT_CONFIGURED,
      isCurrentActive: tenant.activePaymentChannel === toPrismaChannel(channel),
      invalidReason: null,
      lastValidatedAt: null,
      updatedAt: null,
      updatedBy: null,
      config: null,
    };
  }

  return {
    channel: toContractChannel(config.channel),
    tenantId: tenant.id,
    tenantName: tenant.name,
    status: toContractStatus(config.status),
    isCurrentActive: tenant.activePaymentChannel === config.channel,
    invalidReason: config.invalidReason,
    lastValidatedAt: toIsoString(config.lastValidatedAt),
    updatedAt: config.updatedAt.toISOString(),
    updatedBy: config.updatedBy,
    config: (config.configJson as Record<string, unknown> | null) ?? null,
  };
}

/** 将共享支付渠道映射为 Prisma 枚举 */
export function toPrismaChannel(channel: PaymentChannel): PrismaPaymentChannelEnum {
  switch (channel) {
    case PaymentChannelEnum.LAKALA:
      return PrismaPaymentChannelEnum.LAKALA;
    case PaymentChannelEnum.SHOUQIANBA:
      return PrismaPaymentChannelEnum.SHOUQIANBA;
    case PaymentChannelEnum.PINGAN_BANK:
      return PrismaPaymentChannelEnum.PINGAN_BANK;
  }
}
