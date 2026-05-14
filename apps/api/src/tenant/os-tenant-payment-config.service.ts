import { Injectable } from '@nestjs/common';
import { AuditTargetTypeEnum as PrismaAuditTargetTypeEnum } from '@prisma/client';
import type { TenantPaymentConfigListItem, TenantPaymentConfigSnapshot } from '@shou/types/contracts';
import type { PaginatedResponse } from '@shou/types/common';
import type { PaymentChannel, TenantPaymentConfigStatus, TenantStatus } from '@shou/types/enums';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { normalizePage, normalizePageSize } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsPaymentConfigService } from '../settings/settings-payment-config.service';
import { createTenantAuditLog } from './tenant.shared';

@Injectable()
export class OsTenantPaymentConfigService {
  constructor(
    private readonly settingsPaymentConfigService: SettingsPaymentConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** 平台侧分页获取已有支付渠道配置记录 */
  async getPaymentConfigs(query: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: TenantPaymentConfigStatus;
    tenantStatus?: TenantStatus;
  }): Promise<PaginatedResponse<TenantPaymentConfigListItem>> {
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize);

    return this.settingsPaymentConfigService.listExistingPaymentConfigItems({
      page,
      pageSize,
      keyword: query.keyword,
      status: query.status,
      tenantStatus: query.tenantStatus,
    });
  }

  /** 平台侧获取单租户单渠道配置详情 */
  async getPaymentConfigDetail(tenantId: string, channel: PaymentChannel): Promise<TenantPaymentConfigSnapshot> {
    return this.settingsPaymentConfigService.getPaymentConfigDetailByTenantId(tenantId, channel);
  }

  /** 平台侧停用单租户单渠道配置 */
  async disablePaymentConfig(currentUser: JwtPayload, tenantId: string, channel: PaymentChannel, ip?: string): Promise<TenantPaymentConfigSnapshot> {
    const result = await this.settingsPaymentConfigService.disablePaymentConfigByTenantId(tenantId, channel, currentUser.role);

    await createTenantAuditLog(this.prisma, currentUser, {
      tenantId,
      action: '平台停用支付渠道配置',
      target: channel,
      targetType: PrismaAuditTargetTypeEnum.TENANT,
      ip,
    });

    return result;
  }

  /** 平台侧切换单租户当前生效支付渠道 */
  async activatePaymentConfig(currentUser: JwtPayload, tenantId: string, channel: PaymentChannel, ip?: string): Promise<TenantPaymentConfigSnapshot> {
    const result = await this.settingsPaymentConfigService.activatePaymentConfigByTenantId(tenantId, channel, currentUser.role);

    await createTenantAuditLog(this.prisma, currentUser, {
      tenantId,
      action: '平台切换当前生效支付渠道',
      target: channel,
      targetType: PrismaAuditTargetTypeEnum.TENANT,
      ip,
    });

    return result;
  }
}
