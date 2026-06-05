import { Injectable } from '@nestjs/common';
import { TenantStatusEnum as PrismaTenantStatusEnum, type Prisma } from '@prisma/client';
import { TenantStatusEnum, type TenantStatus } from '@shou/types/enums';
import { BusinessException } from '../common/exceptions/business.exception';
import { PrismaService } from '../prisma/prisma.service';
import { fromPrismaTenantStatus } from '../tenant/mapping/tenant.mapper';

export type H5TenantPaymentLifecycleDecision = {
  canAcceptPayment: boolean;
  status: TenantStatus;
  failureMessage: string | null;
};

export type H5TenantLifecycleRecord = {
  tenantId: string;
  status: PrismaTenantStatusEnum;
};

@Injectable()
export class PaymentTenantLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  /** 基于已加载租户主记录裁决 H5 在线支付与线下登记是否允许继续 */
  resolveH5PaymentLifecycle(record: H5TenantLifecycleRecord): H5TenantPaymentLifecycleDecision {
    const status = fromPrismaTenantStatus(record.status);
    if (status === TenantStatusEnum.ACTIVE || status === TenantStatusEnum.ATTENTION) {
      return {
        canAcceptPayment: true,
        status,
        failureMessage: null,
      };
    }

    if (status === TenantStatusEnum.PAUSED) {
      return {
        canAcceptPayment: false,
        status,
        failureMessage: '当前商户已暂停收款，请联系商户处理',
      };
    }

    return {
      canAcceptPayment: false,
      status,
      failureMessage: '当前商户尚未正式开通收款，请联系商户处理',
    };
  }

  /** 从数据库读取租户状态并裁决 H5 支付生命周期，供支付动作入口二次拦截 */
  async resolveH5PaymentLifecycleByTenantId(
    tenantId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<H5TenantPaymentLifecycleDecision> {
    const tenant = await client.tenant.findFirst({
      where: {
        id: tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!tenant) {
      throw new BusinessException(40401, '租户不存在', 404);
    }

    return this.resolveH5PaymentLifecycle({
      tenantId: tenant.id,
      status: tenant.status,
    });
  }

  /** H5 支付动作硬拦截，避免绕过详情页 paymentAction 直接提交动作 */
  assertH5PaymentLifecycleAllowed(decision: H5TenantPaymentLifecycleDecision): void {
    if (!decision.canAcceptPayment) {
      throw new BusinessException(1006, decision.failureMessage ?? '当前商户暂不可收款，请联系商户处理', 409);
    }
  }
}
