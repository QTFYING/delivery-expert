import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  AuditTargetTypeEnum as PrismaAuditTargetTypeEnum,
  TenantStatusEnum as PrismaTenantStatusEnum,
  UserRoleEnum,
  UserStatusEnum,
} from '@prisma/client';
import type {
  CreateTenantAuditBatchRequest,
  CreateTenantAuditDecisionRequest,
  CreateTenantRequest,
  CreateTenantRenewalRequest,
  CreateTenantStatusChangeBatchRequest,
  PatchTenantStatusRequest,
  TenantAuditDecisionResponse,
  TenantBatchActionResponse,
  TenantRecordItem,
  TenantRenewalResponse,
  TenantStatusMutationResponse,
} from '@shou/types/contracts';
import { FreezeActionEnum, ReviewActionEnum } from '@shou/types/enums';
import * as bcrypt from 'bcrypt';
import dayjs from 'dayjs';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { normalizeIdArray, normalizeText } from '../common/validators';
import { ID_CONFIG } from '../id-generator/id-generator.constants';
import { IdGeneratorService } from '../id-generator/id-generator.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  fromPrismaTenantSoftwareVersion,
  fromPrismaTenantStatus,
  resolveTenantSoftwareNameFromPrisma,
  toPrismaTenantSoftwareVersion,
  toTenantRecordItem,
} from './mapping/tenant.mapper';
import { getTenantOrThrow } from './tenant.access';
import { createTenantAuditLog } from './tenant.shared';

const DEFAULT_OWNER_PASSWORD = '123456';

@Injectable()
export class OsTenantLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idGen: IdGeneratorService,
  ) {}

  // 创建 OS 侧租户，并初始化租户生命周期字段
  async createAdminTenant(currentUser: JwtPayload, request: CreateTenantRequest, ip?: string): Promise<TenantRecordItem> {
    const tenantName = normalizeText(request.name, 'name', 100);
    const softwareVersion = toPrismaTenantSoftwareVersion(request.softwareVersion);
    const adminName = normalizeText(request.admin, 'admin', 50);
    const address = normalizeText(request.address, 'address', 255);
    const licenseNo = normalizeText(request.licenseNo, 'licenseNo', 100);
    const ownerAccount = normalizeText(request.ownerAccount, 'ownerAccount', 50);
    const ownerPhone = normalizeText(request.ownerPhone, 'ownerPhone', 20);
    const ownerPassword = request.ownerInitialPassword?.trim() || DEFAULT_OWNER_PASSWORD;
    await this.ensureAccountAvailable(ownerAccount);
    const tenantId = await this.idGen.nextGlobalId(ID_CONFIG.TENANT.prefix, ID_CONFIG.TENANT.seqName, ID_CONFIG.TENANT.digits);
    const serviceExpireAt = this.parseServiceExpireAt(request.serviceExpireAt);
    const passwordHash = await bcrypt.hash(ownerPassword, 10);

    const created = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          id: tenantId,
          name: tenantName,
          contactPhone: '',
          softwareVersion,
          adminName,
          address,
          licenseNo,
          status: PrismaTenantStatusEnum.ONBOARDING,
          serviceExpireAt,
        },
      });

      const owner = await tx.user.create({
        data: {
          tenantId: tenant.id,
          account: ownerAccount,
          phone: ownerPhone,
          passwordHash,
          realName: adminName,
          role: UserRoleEnum.TENANT_OWNER,
          scope: 'tenant',
          status: UserStatusEnum.ACTIVE,
          requiresPasswordReset: true,
        },
      });

      await createTenantAuditLog(tx, currentUser, {
        tenantId: tenant.id,
        action: '创建租户',
        target: tenant.name,
        targetType: PrismaAuditTargetTypeEnum.TENANT,
        ip,
      });
      await createTenantAuditLog(tx, currentUser, {
        tenantId: tenant.id,
        action: '创建租户首个老板账号',
        target: owner.realName || owner.account,
        targetType: PrismaAuditTargetTypeEnum.ACCOUNT,
        ip,
      });

      return tx.tenant.findUniqueOrThrow({
        where: { id: tenant.id },
        include: {
          users: { where: { deletedAt: null }, select: { id: true, loginAt: true } },
          payments: {
            where: { paidAt: { gte: dayjs().startOf('month').toDate() } },
            select: { amount: true },
          },
          paymentOrders: { select: { channel: true } },
        },
      });
    });

    return toTenantRecordItem(created, [request.channel]);
  }

  // 处理单个租户的审核决议
  async createTenantAuditDecision(
    currentUser: JwtPayload,
    tenantId: string,
    request: CreateTenantAuditDecisionRequest,
    ip?: string,
  ): Promise<TenantAuditDecisionResponse> {
    const tenant = await getTenantOrThrow(this.prisma, tenantId);
    if (request.action === ReviewActionEnum.REJECT && !request.rejectReason?.trim()) {
      throw new BadRequestException('rejectReason 不能为空');
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        status: request.action === ReviewActionEnum.APPROVE ? PrismaTenantStatusEnum.ACTIVE : PrismaTenantStatusEnum.ONBOARDING,
        rejectReason: request.action === ReviewActionEnum.REJECT ? request.rejectReason?.trim() || null : null,
      },
    });

    await createTenantAuditLog(this.prisma, currentUser, {
      tenantId: tenant.id,
      action: request.action === ReviewActionEnum.APPROVE ? '通过租户审核' : '驳回租户审核',
      target: tenant.name,
      targetType: PrismaAuditTargetTypeEnum.TENANT,
      ip,
    });

    return {
      tenantId: updated.id,
      status: fromPrismaTenantStatus(updated.status),
      rejectReason: updated.rejectReason ?? null,
      reviewedAt: updated.updatedAt.toISOString(),
    };
  }

  // 批量通过租户审核，并记录失败 ID
  async createTenantAuditBatch(currentUser: JwtPayload, request: CreateTenantAuditBatchRequest, ip?: string): Promise<TenantBatchActionResponse> {
    const ids = normalizeIdArray(request.ids, 'ids');
    const failedIds: string[] = [];
    let successCount = 0;

    for (const id of ids) {
      try {
        await this.prisma.tenant.update({
          where: { id },
          data: {
            status: PrismaTenantStatusEnum.ACTIVE,
            rejectReason: null,
          },
        });
        successCount += 1;
      } catch {
        failedIds.push(id);
      }
    }

    await createTenantAuditLog(this.prisma, currentUser, {
      tenantId: null,
      action: '批量通过租户审核',
      target: ids.join(','),
      targetType: PrismaAuditTargetTypeEnum.TENANT,
      ip,
    });

    return { successCount, failedIds };
  }

  // 为指定租户续费并刷新服务到期时间
  async createTenantRenewal(
    currentUser: JwtPayload,
    tenantId: string,
    request: CreateTenantRenewalRequest,
    ip?: string,
  ): Promise<TenantRenewalResponse> {
    const tenant = await getTenantOrThrow(this.prisma, tenantId);

    const updated = await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        softwareVersion: toPrismaTenantSoftwareVersion(request.softwareVersion),
        serviceExpireAt: this.parseServiceExpireAt(request.serviceExpireAt),
      },
    });

    await createTenantAuditLog(this.prisma, currentUser, {
      tenantId: tenant.id,
      action: '租户续费',
      target: tenant.name,
      targetType: PrismaAuditTargetTypeEnum.TENANT,
      ip,
    });

    return {
      tenantId: updated.id,
      softwareName: resolveTenantSoftwareNameFromPrisma(updated.softwareVersion),
      softwareVersion: fromPrismaTenantSoftwareVersion(updated.softwareVersion),
      status: fromPrismaTenantStatus(updated.status),
      serviceExpireAt: updated.serviceExpireAt?.toISOString() ?? '',
      renewedAt: updated.updatedAt.toISOString(),
    };
  }

  // 冻结或解冻单个租户
  async patchTenantStatus(
    currentUser: JwtPayload,
    tenantId: string,
    request: PatchTenantStatusRequest,
    ip?: string,
  ): Promise<TenantStatusMutationResponse> {
    const tenant = await getTenantOrThrow(this.prisma, tenantId);
    if (request.action === FreezeActionEnum.FREEZE && !request.reason?.trim()) {
      throw new BadRequestException('冻结时 reason 必填');
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        status: request.action === FreezeActionEnum.FREEZE ? PrismaTenantStatusEnum.PAUSED : PrismaTenantStatusEnum.ACTIVE,
        freezeReason: request.action === FreezeActionEnum.FREEZE ? request.reason?.trim() || null : null,
      },
    });

    await createTenantAuditLog(this.prisma, currentUser, {
      tenantId: tenant.id,
      action: request.action === FreezeActionEnum.FREEZE ? '冻结租户' : '解冻租户',
      target: tenant.name,
      targetType: PrismaAuditTargetTypeEnum.TENANT,
      ip,
    });

    return {
      tenantId: updated.id,
      status: fromPrismaTenantStatus(updated.status),
      freezeReason: updated.freezeReason ?? null,
      effectiveAt: updated.updatedAt.toISOString(),
    };
  }

  // 批量冻结租户，并返回失败 ID 列表
  async createTenantStatusChangeBatch(
    currentUser: JwtPayload,
    request: CreateTenantStatusChangeBatchRequest,
    ip?: string,
  ): Promise<TenantBatchActionResponse> {
    const ids = normalizeIdArray(request.ids, 'ids');
    const failedIds: string[] = [];
    let successCount = 0;

    for (const id of ids) {
      try {
        await this.prisma.tenant.update({
          where: { id },
          data: {
            status: PrismaTenantStatusEnum.PAUSED,
            freezeReason: normalizeText(request.reason, 'reason', 255),
          },
        });
        successCount += 1;
      } catch {
        failedIds.push(id);
      }
    }

    await createTenantAuditLog(this.prisma, currentUser, {
      tenantId: null,
      action: '批量冻结租户',
      target: ids.join(','),
      targetType: PrismaAuditTargetTypeEnum.TENANT,
      ip,
    });

    return { successCount, failedIds };
  }

  // 校验首个老板登录账号是否可用
  private async ensureAccountAvailable(account: string): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: {
        account,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('首个老板登录账号已存在');
    }
  }

  // 解析平台提交的服务到期时间；接口契约要求传 ISO 日期时间字符串
  private parseServiceExpireAt(value: string): Date {
    const parsed = dayjs(value);
    if (!parsed.isValid()) {
      throw new BadRequestException('serviceExpireAt 不是合法日期时间');
    }
    return parsed.toDate();
  }
}
