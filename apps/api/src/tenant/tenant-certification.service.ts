import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AuditTargetTypeEnum as PrismaAuditTargetTypeEnum,
  TenantCertificationStatusEnum as PrismaTenantCertificationStatusEnum,
} from '@prisma/client';
import type { TenantCertificationStatusResult, TenantCertificationSubmitRequest, TenantCertificationSubmitResponse } from '@shou/types/contracts';
import { TenantCertificationStatusEnum } from '@shou/types/enums';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { formatDateTime, normalizeText } from '../common/validators';
import { ID_CONFIG } from '../id-generator/id-generator.constants';
import { IdGeneratorService } from '../id-generator/id-generator.service';
import { PrismaService } from '../prisma/prisma.service';
import { fromPrismaCertificationStatus } from './mapping/tenant.mapper';
import { createTenantAuditLog } from './tenant.shared';

@Injectable()
export class TenantCertificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idGen: IdGeneratorService,
  ) {}

  // 提交当前租户的资质材料。
  async submitCertification(
    currentUser: JwtPayload,
    request: TenantCertificationSubmitRequest,
    ip?: string,
  ): Promise<TenantCertificationSubmitResponse> {
    const tenantId = this.requireTenantId(currentUser);
    const certId = await this.idGen.nextGlobalId(ID_CONFIG.CERTIFICATION.prefix, ID_CONFIG.CERTIFICATION.seqName, ID_CONFIG.CERTIFICATION.digits);
    const created = await this.prisma.tenantCertification.create({
      data: {
        id: certId,
        tenantId,
        type: '企业实名认证',
        licenseUrl: normalizeText(request.licenseUrl, 'licenseUrl', 500),
        legalPerson: normalizeText(request.legalPerson, 'legalPerson', 50),
        legalIdCard: normalizeText(request.legalIdCard, 'legalIdCard', 50),
        contactPhone: normalizeText(request.contactPhone, 'contactPhone', 20),
        remark: request.remark?.trim() || null,
        status: PrismaTenantCertificationStatusEnum.PENDING_INITIAL_REVIEW,
      },
    });

    await createTenantAuditLog(this.prisma, currentUser, {
      tenantId,
      action: '提交资质材料',
      target: created.id,
      targetType: PrismaAuditTargetTypeEnum.TENANT,
      ip,
    });

    return {
      certId: created.id,
      status: TenantCertificationStatusEnum.PENDING_INITIAL_REVIEW,
      submittedAt: created.submitAt.toISOString(),
    };
  }

  // 获取当前租户最近一次资质状态。
  async getCertificationStatus(currentUser: JwtPayload): Promise<TenantCertificationStatusResult> {
    const tenantId = this.requireTenantId(currentUser);
    const latest = await this.prisma.tenantCertification.findFirst({
      where: { tenantId },
      orderBy: [{ submitAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (!latest) {
      return {
        certId: null,
        status: null,
        submittedAt: null,
        reviewedAt: null,
        reviewComment: null,
        rejectReason: null,
      };
    }

    return {
      certId: latest.id,
      status: fromPrismaCertificationStatus(latest.status),
      submittedAt: formatDateTime(latest.submitAt),
      reviewedAt: formatDateTime(latest.reviewedAt) ?? null,
      reviewComment: latest.comment ?? null,
      rejectReason: latest.rejectReason ?? null,
    };
  }

  // 校验当前登录态属于租户侧并返回 tenantId。
  private requireTenantId(currentUser: JwtPayload): string {
    if (!currentUser.tenantId) {
      throw new ForbiddenException('当前登录态不属于租户侧');
    }

    return currentUser.tenantId;
  }
}
