import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditTargetTypeEnum as PrismaAuditTargetTypeEnum,
  PaymentChannelEnum as PrismaPaymentChannelEnum,
  TenantPaymentConfigStoredStatusEnum as PrismaTenantPaymentConfigStoredStatusEnum,
  TenantStatusEnum as PrismaTenantStatusEnum,
  type Prisma,
} from '@prisma/client';
import type {
  GetTenantPaymentConfigListResponse,
  TenantPaymentConfigListItem,
  TenantPaymentConfigSnapshot,
  UpsertTenantPaymentConfigRequest,
} from '@shou/types/contracts';
import {
  PaymentChannelEnum,
  TenantPaymentConfigStatusEnum,
  TenantStatusEnum,
  type PaymentChannel,
  type TenantPaymentConfigStatus,
  type TenantStatus,
} from '@shou/types/enums';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildTenantPaymentConfigListItem,
  buildTenantPaymentConfigListItemForMissing,
  buildTenantPaymentConfigSnapshot,
  toPrismaChannel,
} from './mapping/payment-config.mapper';
import { createAuditLog, getTenantSideId } from './settings.shared';

const SUPPORTED_PAYMENT_CHANNELS: PaymentChannel[] = [PaymentChannelEnum.LAKALA, PaymentChannelEnum.SHOUQIANBA, PaymentChannelEnum.PINGAN_BANK];
const ONLINE_GATEWAY_ENABLED_CHANNELS: PaymentChannel[] = [PaymentChannelEnum.LAKALA];
const UNSUPPORTED_PAYMENT_CHANNEL_CONFIG_REASON = '渠道尚未接入，暂时不支持该支付渠道配置。';

type TenantSummaryRecord = {
  id: string;
  name: string;
  status: PrismaTenantStatusEnum;
  activePaymentChannel: PrismaPaymentChannelEnum | null;
};

@Injectable()
export class SettingsPaymentConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** 获取当前租户的支付渠道配置列表 */
  async getPaymentConfigList(currentUser: JwtPayload): Promise<GetTenantPaymentConfigListResponse> {
    return this.getPaymentConfigListByTenantId(getTenantSideId(currentUser));
  }

  /** 获取当前租户某个支付渠道的配置详情 */
  async getPaymentConfigDetail(currentUser: JwtPayload, channel: PaymentChannel): Promise<TenantPaymentConfigSnapshot> {
    return this.getPaymentConfigDetailByTenantId(getTenantSideId(currentUser), channel);
  }

  /** 保存当前租户某个支付渠道的整份配置 */
  async upsertPaymentConfig(
    currentUser: JwtPayload,
    channel: PaymentChannel,
    request: UpsertTenantPaymentConfigRequest,
  ): Promise<TenantPaymentConfigSnapshot> {
    return this.upsertPaymentConfigByTenantId(getTenantSideId(currentUser), channel, request, currentUser.role);
  }

  /** 停用当前租户某个支付渠道配置 */
  async disablePaymentConfig(currentUser: JwtPayload, channel: PaymentChannel, ip?: string): Promise<TenantPaymentConfigSnapshot> {
    const tenantId = getTenantSideId(currentUser);
    const result = await this.disablePaymentConfigByTenantId(tenantId, channel, currentUser.role);

    await createAuditLog(this.prisma, currentUser, {
      tenantId,
      action: '停用支付渠道配置',
      target: channel,
      targetType: PrismaAuditTargetTypeEnum.TENANT,
      ip,
    });

    return result;
  }

  /** 激活当前租户某个支付渠道为当前生效渠道 */
  async activatePaymentConfig(currentUser: JwtPayload, channel: PaymentChannel, ip?: string): Promise<TenantPaymentConfigSnapshot> {
    const tenantId = getTenantSideId(currentUser);
    const result = await this.activatePaymentConfigByTenantId(tenantId, channel, currentUser.role);

    await createAuditLog(this.prisma, currentUser, {
      tenantId,
      action: '切换当前生效支付渠道',
      target: channel,
      targetType: PrismaAuditTargetTypeEnum.TENANT,
      ip,
    });

    return result;
  }

  /** 按租户获取支付渠道配置列表 */
  async getPaymentConfigListByTenantId(tenantId: string): Promise<GetTenantPaymentConfigListResponse> {
    const tenant = await this.getTenantById(tenantId);
    const configs = await this.prisma.tenantPaymentConfig.findMany({
      where: {
        tenantId: tenant.id,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const configMap = new Map(configs.map((item) => [item.channel, item]));

    return {
      activePaymentChannel: tenant.activePaymentChannel ? this.toContractChannel(tenant.activePaymentChannel) : null,
      items: SUPPORTED_PAYMENT_CHANNELS.map((channel) => {
        const config = configMap.get(toPrismaChannel(channel));
        return config ? buildTenantPaymentConfigListItem(tenant, config) : buildTenantPaymentConfigListItemForMissing(tenant, channel);
      }),
    };
  }

  /** 按租户获取单个支付渠道配置详情 */
  async getPaymentConfigDetailByTenantId(tenantId: string, channel: PaymentChannel): Promise<TenantPaymentConfigSnapshot> {
    const tenant = await this.getTenantById(tenantId);
    const prismaChannel = this.assertSupportedChannel(channel);
    const config = await this.prisma.tenantPaymentConfig.findUnique({
      where: {
        tenantId_channel: {
          tenantId: tenant.id,
          channel: prismaChannel,
        },
      },
    });

    return buildTenantPaymentConfigSnapshot(tenant, channel, config);
  }

  /** 按租户保存整份支付渠道配置 */
  async upsertPaymentConfigByTenantId(
    tenantId: string,
    channel: PaymentChannel,
    request: UpsertTenantPaymentConfigRequest,
    updatedBy: string,
  ): Promise<TenantPaymentConfigSnapshot> {
    const tenant = await this.getTenantById(tenantId);
    const prismaChannel = this.assertSupportedChannel(channel);
    const nextConfig = this.normalizeConfig(request.config);
    const validationError = this.getValidationError(prismaChannel, nextConfig as Record<string, unknown>);
    const status = validationError ? PrismaTenantPaymentConfigStoredStatusEnum.INVALID : PrismaTenantPaymentConfigStoredStatusEnum.AVAILABLE;
    const now = new Date();

    const updated = await this.prisma.tenantPaymentConfig.upsert({
      where: {
        tenantId_channel: {
          tenantId: tenant.id,
          channel: prismaChannel,
        },
      },
      create: {
        tenantId: tenant.id,
        channel: prismaChannel,
        status,
        configJson: nextConfig,
        invalidReason: validationError,
        lastValidatedAt: now,
        updatedBy,
      },
      update: {
        status,
        configJson: nextConfig,
        invalidReason: validationError,
        lastValidatedAt: now,
        updatedBy,
      },
    });

    return buildTenantPaymentConfigSnapshot(tenant, channel, updated);
  }

  /** 按租户停用支付渠道配置 */
  async disablePaymentConfigByTenantId(tenantId: string, channel: PaymentChannel, updatedBy: string): Promise<TenantPaymentConfigSnapshot> {
    const tenant = await this.getTenantById(tenantId);
    const prismaChannel = this.assertSupportedChannel(channel);

    const result = await this.prisma.$transaction(async (tx) => {
      await this.getExistingPaymentConfig(tenant.id, prismaChannel, tx);

      const updated = await tx.tenantPaymentConfig.update({
        where: {
          tenantId_channel: {
            tenantId: tenant.id,
            channel: prismaChannel,
          },
        },
        data: {
          status: PrismaTenantPaymentConfigStoredStatusEnum.DISABLED,
          updatedBy,
        },
      });

      const nextTenant =
        tenant.activePaymentChannel === prismaChannel
          ? await tx.tenant.update({
              where: { id: tenant.id },
              data: { activePaymentChannel: null },
              select: {
                id: true,
                name: true,
                status: true,
                activePaymentChannel: true,
              },
            })
          : tenant;

      return {
        tenant: nextTenant,
        config: updated,
      };
    });

    return buildTenantPaymentConfigSnapshot(result.tenant, channel, result.config);
  }

  /** 按租户切换当前生效支付渠道 */
  async activatePaymentConfigByTenantId(tenantId: string, channel: PaymentChannel, updatedBy: string): Promise<TenantPaymentConfigSnapshot> {
    const tenant = await this.getTenantById(tenantId);
    const prismaChannel = this.assertSupportedChannel(channel);
    if (!ONLINE_GATEWAY_ENABLED_CHANNELS.includes(channel)) {
      throw new BadRequestException('当前支付渠道暂未接入线上支付网关，不能设为生效渠道');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await this.getExistingPaymentConfig(tenant.id, prismaChannel, tx);
      if (existing.status !== PrismaTenantPaymentConfigStoredStatusEnum.AVAILABLE) {
        throw new BadRequestException('仅可激活状态为 available 的支付渠道配置');
      }

      const nextTenant = await tx.tenant.update({
        where: { id: tenant.id },
        data: { activePaymentChannel: prismaChannel },
        select: {
          id: true,
          name: true,
          status: true,
          activePaymentChannel: true,
        },
      });

      const updated = await tx.tenantPaymentConfig.update({
        where: {
          tenantId_channel: {
            tenantId: tenant.id,
            channel: prismaChannel,
          },
        },
        data: {
          updatedBy,
        },
      });

      return {
        tenant: nextTenant,
        config: updated,
      };
    });

    return buildTenantPaymentConfigSnapshot(result.tenant, channel, result.config);
  }

  /** 按查询条件分页获取已有支付渠道配置记录 */
  async listExistingPaymentConfigItems(input: {
    page: number;
    pageSize: number;
    keyword?: string;
    tenantStatus?: TenantStatus;
    status?: TenantPaymentConfigStatus;
  }): Promise<{
    list: TenantPaymentConfigListItem[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const keyword = input.keyword?.trim();
    const tenantStatus = input.tenantStatus ? this.toPrismaTenantStatus(input.tenantStatus) : undefined;
    const status = input.status ? this.toPrismaStoredStatus(input.status) : undefined;
    const keywordOr: Prisma.TenantPaymentConfigWhereInput[] = [];

    if (keyword) {
      keywordOr.push(
        {
          tenantId: {
            contains: keyword,
            mode: 'insensitive',
          },
        },
        {
          tenant: {
            name: {
              contains: keyword,
              mode: 'insensitive',
            },
          },
        },
        {
          configJson: {
            path: ['merchantNo'],
            string_contains: keyword,
          },
        },
      );
    }

    const where: Prisma.TenantPaymentConfigWhereInput = {
      tenant: {
        deletedAt: null,
        ...(tenantStatus ? { status: tenantStatus } : {}),
      },
      ...(status ? { status } : {}),
      ...(keywordOr.length > 0 ? { OR: keywordOr } : {}),
    };

    const [configs, total] = await Promise.all([
      this.prisma.tenantPaymentConfig.findMany({
        where,
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              status: true,
              activePaymentChannel: true,
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.tenantPaymentConfig.count({ where }),
    ]);

    return {
      list: configs.map((item) =>
        buildTenantPaymentConfigListItem(
          {
            id: item.tenant.id,
            name: item.tenant.name,
            status: item.tenant.status,
            activePaymentChannel: item.tenant.activePaymentChannel,
          },
          item,
        ),
      ),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  /** 按租户 ID 获取租户主记录 */
  private async getTenantById(tenantId: string): Promise<TenantSummaryRecord> {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id: tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        status: true,
        activePaymentChannel: true,
      },
    });

    if (!tenant) {
      throw new BadRequestException('当前租户不存在');
    }

    return tenant;
  }

  /** 获取当前租户某个已存在的支付渠道配置 */
  private async getExistingPaymentConfig(
    tenantId: string,
    channel: PrismaPaymentChannelEnum,
    prisma: Pick<PrismaService, 'tenantPaymentConfig'> = this.prisma,
  ) {
    const config = await prisma.tenantPaymentConfig.findUnique({
      where: {
        tenantId_channel: {
          tenantId,
          channel,
        },
      },
    });

    if (!config) {
      throw new NotFoundException('支付渠道配置不存在');
    }

    return config;
  }

  /** 校验当前渠道是否已开放给租户配置 */
  private assertSupportedChannel(channel: PaymentChannel): PrismaPaymentChannelEnum {
    if (!SUPPORTED_PAYMENT_CHANNELS.includes(channel)) {
      throw new BadRequestException('当前支付渠道暂不支持租户配置');
    }

    return toPrismaChannel(channel);
  }

  /** 规范化渠道专属配置 */
  private normalizeConfig(config: Record<string, unknown>): Prisma.InputJsonValue {
    if (!config || Array.isArray(config) || Object.keys(config).length === 0) {
      throw new BadRequestException('config 不能为空对象');
    }

    return config as Prisma.InputJsonValue;
  }

  /** 返回渠道配置的本地校验结果 */
  private getValidationError(channel: PrismaPaymentChannelEnum, config: Record<string, unknown> | null): string | null {
    switch (channel) {
      case PrismaPaymentChannelEnum.LAKALA:
        return this.getLakalaValidationError(config);
      case PrismaPaymentChannelEnum.SHOUQIANBA:
      case PrismaPaymentChannelEnum.PINGAN_BANK:
        return UNSUPPORTED_PAYMENT_CHANNEL_CONFIG_REASON;
    }
  }

  /** 校验拉卡拉配置是否具备最小可用字段 */
  private getLakalaValidationError(config: Record<string, unknown> | null): string | null {
    const merchantNo = typeof config?.merchantNo === 'string' ? config.merchantNo.trim() : '';
    if (!merchantNo) {
      return 'merchantNo 不能为空';
    }

    return null;
  }

  /** 将 Prisma 支付渠道映射为共享闭集 */
  private toContractChannel(channel: PrismaPaymentChannelEnum): PaymentChannel {
    switch (channel) {
      case PrismaPaymentChannelEnum.LAKALA:
        return PaymentChannelEnum.LAKALA;
      case PrismaPaymentChannelEnum.SHOUQIANBA:
        return PaymentChannelEnum.SHOUQIANBA;
      case PrismaPaymentChannelEnum.PINGAN_BANK:
        return PaymentChannelEnum.PINGAN_BANK;
    }
  }

  /** 将对外租户状态映射为 Prisma 枚举 */
  private toPrismaTenantStatus(status: TenantStatus): PrismaTenantStatusEnum {
    switch (status) {
      case TenantStatusEnum.ACTIVE:
        return PrismaTenantStatusEnum.ACTIVE;
      case TenantStatusEnum.ONBOARDING:
        return PrismaTenantStatusEnum.ONBOARDING;
      case TenantStatusEnum.ATTENTION:
        return PrismaTenantStatusEnum.ATTENTION;
      case TenantStatusEnum.PAUSED:
        return PrismaTenantStatusEnum.PAUSED;
    }
  }

  /** 将对外配置状态映射为持久化状态 */
  private toPrismaStoredStatus(status: TenantPaymentConfigStatus): PrismaTenantPaymentConfigStoredStatusEnum {
    switch (status) {
      case TenantPaymentConfigStatusEnum.PENDING_VALIDATION:
        return PrismaTenantPaymentConfigStoredStatusEnum.PENDING_VALIDATION;
      case TenantPaymentConfigStatusEnum.AVAILABLE:
        return PrismaTenantPaymentConfigStoredStatusEnum.AVAILABLE;
      case TenantPaymentConfigStatusEnum.DISABLED:
        return PrismaTenantPaymentConfigStoredStatusEnum.DISABLED;
      case TenantPaymentConfigStatusEnum.INVALID:
        return PrismaTenantPaymentConfigStoredStatusEnum.INVALID;
      case TenantPaymentConfigStatusEnum.NOT_CONFIGURED:
        throw new BadRequestException('列表接口不支持按 not_configured 筛选');
    }
  }
}
