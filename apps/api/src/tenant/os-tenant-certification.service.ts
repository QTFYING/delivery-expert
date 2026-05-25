import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditTargetTypeEnum as PrismaAuditTargetTypeEnum,
  TenantCertificationStatusEnum as PrismaTenantCertificationStatusEnum,
} from '@prisma/client';
import type {
  CreateTenantCertificationReviewDecisionRequest,
  TenantCertificationRecordItem,
  TenantCertificationReviewDecisionResponse,
} from '@shou/types/contracts';
import { ReviewActionEnum } from '@shou/types/enums';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { formatDateTime } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import { fromPrismaCertificationStatus, getNextCertificationStatus, toPrismaCertificationStatus } from './mapping/tenant.mapper';
import { createTenantAuditLog } from './tenant.shared';

@Injectable()
export class OsTenantCertificationService {
  constructor(private readonly prisma: PrismaService) {}

  // 获取待审核的资质队列
  async getCertificationQueue(): Promise<TenantCertificationRecordItem[]> {
    const records = await this.prisma.tenantCertification.findMany({
      where: {
        status: {
          in: [
            PrismaTenantCertificationStatusEnum.PENDING_INITIAL_REVIEW,
            PrismaTenantCertificationStatusEnum.PENDING_SECONDARY_REVIEW,
            PrismaTenantCertificationStatusEnum.PENDING_CONFIRMATION,
          ],
        },
      },
      include: {
        tenant: true,
      },
      orderBy: { submitAt: 'asc' },
    });

    return records.map((item) => ({
      id: item.id,
      tenant: item.tenant.name,
      type: item.type,
      submitAt: formatDateTime(item.submitAt),
      status: fromPrismaCertificationStatus(item.status),
      comment: item.comment ?? undefined,
    }));
  }

  // 处理单条资质审核决议并推进状态机
  async createCertificationReviewDecision(
    currentUser: JwtPayload,
    certificationId: string,
    request: CreateTenantCertificationReviewDecisionRequest,
    ip?: string,
  ): Promise<TenantCertificationReviewDecisionResponse> {
    const certification = await this.prisma.tenantCertification.findUnique({
      where: { id: certificationId },
      include: { tenant: true },
    });

    if (!certification) {
      throw new NotFoundException('资质记录不存在');
    }

    const previousStatus = certification.status;
    const nextStatus = getNextCertificationStatus(fromPrismaCertificationStatus(previousStatus), request.action);
    const reviewedAt = new Date();
    const updated = await this.prisma.tenantCertification.update({
      where: { id: certification.id },
      data: {
        status: toPrismaCertificationStatus(nextStatus),
        comment: request.comment?.trim() || null,
        rejectReason: request.action === ReviewActionEnum.REJECT ? request.comment?.trim() || null : null,
        reviewedAt,
      },
      include: { tenant: true },
    });

    await createTenantAuditLog(this.prisma, currentUser, {
      tenantId: updated.tenantId,
      action: '处理资质审核',
      target: updated.tenant.name,
      targetType: PrismaAuditTargetTypeEnum.TENANT,
      ip,
    });

    return {
      id: updated.id,
      tenant: updated.tenant.name,
      type: updated.type,
      submitAt: updated.submitAt.toISOString(),
      previousStatus: fromPrismaCertificationStatus(previousStatus),
      status: fromPrismaCertificationStatus(updated.status),
      comment: updated.comment ?? undefined,
      reviewedAt: reviewedAt.toISOString(),
    };
  }
}
