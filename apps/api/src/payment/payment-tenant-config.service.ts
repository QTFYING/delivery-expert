import {
  PaymentChannelEnum as PrismaPaymentChannelEnum,
  TenantPaymentConfigStoredStatusEnum as PrismaTenantPaymentConfigStoredStatusEnum,
  type Prisma,
} from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PaymentChannelEnum, TenantPaymentConfigStatusEnum, type PaymentChannel, type TenantPaymentConfigStatus } from '@shou/types/enums';
import { BusinessException } from '../common/exceptions/business.exception';
import { PrismaService } from '../prisma/prisma.service';
import { fromPrismaPaymentChannel, toPrismaPaymentChannel } from './mapping/payment.mapper';

type TenantActivePaymentChannelRecord = {
  tenantId: string;
  activePaymentChannel: PrismaPaymentChannelEnum | null;
};

const ONLINE_GATEWAY_ENABLED_CHANNELS: PaymentChannel[] = [PaymentChannelEnum.LAKALA];

export type ActiveTenantPaymentChannelSnapshot = {
  tenantId: string;
  activePaymentChannel: PaymentChannel | null;
  configStatus: TenantPaymentConfigStatus | null;
  invalidReason: string | null;
  config: Record<string, unknown> | null;
};

export type TenantOnlinePaymentAvailability = {
  canInitiate: boolean;
  activePaymentChannel: PaymentChannel | null;
  prismaChannel: PrismaPaymentChannelEnum | null;
  configStatus: TenantPaymentConfigStatus | null;
  failureMessage: string | null;
};

@Injectable()
export class PaymentTenantConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** 基于已知租户主记录读取当前生效支付渠道和对应配置快照 */
  async getActivePaymentChannelSnapshot(
    tenant: TenantActivePaymentChannelRecord,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<ActiveTenantPaymentChannelSnapshot> {
    if (!tenant.activePaymentChannel) {
      return {
        tenantId: tenant.tenantId,
        activePaymentChannel: null,
        configStatus: null,
        invalidReason: null,
        config: null,
      };
    }

    const config = await client.tenantPaymentConfig.findUnique({
      where: {
        tenantId_channel: {
          tenantId: tenant.tenantId,
          channel: tenant.activePaymentChannel,
        },
      },
    });

    return {
      tenantId: tenant.tenantId,
      activePaymentChannel: fromPrismaPaymentChannel(tenant.activePaymentChannel),
      configStatus: config ? this.toTenantPaymentConfigStatus(config.status) : TenantPaymentConfigStatusEnum.NOT_CONFIGURED,
      invalidReason: config?.invalidReason ?? null,
      config: (config?.configJson as Record<string, unknown> | null) ?? null,
    };
  }

  /** 按租户 ID 读取当前生效支付渠道和对应配置快照 */
  async getActivePaymentChannelSnapshotByTenantId(
    tenantId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<ActiveTenantPaymentChannelSnapshot> {
    const tenant = await client.tenant.findFirst({
      where: {
        id: tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        activePaymentChannel: true,
      },
    });

    if (!tenant) {
      throw new BusinessException(40401, '租户不存在', 404);
    }

    return this.getActivePaymentChannelSnapshot(
      {
        tenantId: tenant.id,
        activePaymentChannel: tenant.activePaymentChannel,
      },
      client,
    );
  }

  /** 基于当前生效渠道快照统一裁决线上支付是否允许进入主链路 */
  resolveOnlinePaymentAvailability(snapshot: ActiveTenantPaymentChannelSnapshot): TenantOnlinePaymentAvailability {
    if (!snapshot.activePaymentChannel) {
      return {
        canInitiate: false,
        activePaymentChannel: null,
        prismaChannel: null,
        configStatus: snapshot.configStatus,
        failureMessage: '当前商户暂未开通线上支付，请联系商家',
      };
    }

    switch (snapshot.configStatus) {
      case TenantPaymentConfigStatusEnum.AVAILABLE:
        if (!ONLINE_GATEWAY_ENABLED_CHANNELS.includes(snapshot.activePaymentChannel)) {
          return {
            canInitiate: false,
            activePaymentChannel: snapshot.activePaymentChannel,
            prismaChannel: null,
            configStatus: snapshot.configStatus,
            failureMessage: '当前租户支付渠道暂未接入线上支付，请联系商家',
          };
        }
        return {
          canInitiate: true,
          activePaymentChannel: snapshot.activePaymentChannel,
          prismaChannel: toPrismaPaymentChannel(snapshot.activePaymentChannel),
          configStatus: snapshot.configStatus,
          failureMessage: null,
        };
      case TenantPaymentConfigStatusEnum.NOT_CONFIGURED:
      case TenantPaymentConfigStatusEnum.DISABLED:
        return {
          canInitiate: false,
          activePaymentChannel: snapshot.activePaymentChannel,
          prismaChannel: null,
          configStatus: snapshot.configStatus,
          failureMessage: '当前商户暂未开通线上支付，请联系商家',
        };
      case TenantPaymentConfigStatusEnum.PENDING_VALIDATION:
      case TenantPaymentConfigStatusEnum.INVALID:
        return {
          canInitiate: false,
          activePaymentChannel: snapshot.activePaymentChannel,
          prismaChannel: null,
          configStatus: snapshot.configStatus,
          failureMessage: '当前收单配置异常，请联系管理员',
        };
      default:
        return {
          canInitiate: false,
          activePaymentChannel: snapshot.activePaymentChannel,
          prismaChannel: null,
          configStatus: snapshot.configStatus,
          failureMessage: '当前租户支付渠道不可用',
        };
    }
  }

  /** 将持久化配置状态映射为支付模块使用的业务闭集 */
  private toTenantPaymentConfigStatus(status: PrismaTenantPaymentConfigStoredStatusEnum): TenantPaymentConfigStatus {
    switch (status) {
      case PrismaTenantPaymentConfigStoredStatusEnum.PENDING_VALIDATION:
        return TenantPaymentConfigStatusEnum.PENDING_VALIDATION;
      case PrismaTenantPaymentConfigStoredStatusEnum.AVAILABLE:
        return TenantPaymentConfigStatusEnum.AVAILABLE;
      case PrismaTenantPaymentConfigStoredStatusEnum.DISABLED:
        return TenantPaymentConfigStatusEnum.DISABLED;
      case PrismaTenantPaymentConfigStoredStatusEnum.INVALID:
        return TenantPaymentConfigStatusEnum.INVALID;
    }
  }
}
