import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  AuditTargetTypeEnum as PrismaAuditTargetTypeEnum,
  PaymentChannelEnum as PrismaPaymentChannelEnum,
  Prisma,
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
  FreezeTenantRequest,
  PatchTenantBaseInfoRequest,
  TenantAuditDecisionResponse,
  TenantBatchActionResponse,
  TenantRecordItem,
  TenantRenewalResponse,
  TenantStatusMutationResponse,
  UpdateTenantBaseInfoRequest,
} from '@shou/types/contracts';
import { PaymentChannelEnum, ReviewActionEnum, type PaymentChannel } from '@shou/types/enums';
import * as bcrypt from 'bcrypt';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { normalizeIdArray, normalizeText } from '../common/validators';
import { ensureTenantRbacBootstrap } from '../authorization/tenant-rbac-bootstrap';
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
import { TenantPhoneIdentityService } from './tenant-phone-identity.service';
import { createTenantAuditLog } from './tenant.shared';

dayjs.extend(customParseFormat);

const DEFAULT_OWNER_PASSWORD = '123456';

@Injectable()
export class OsTenantLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idGen: IdGeneratorService,
    private readonly tenantPhoneIdentity: TenantPhoneIdentityService,
  ) {}

  // 创建 OS 侧租户，并初始化租户生命周期字段
  async createAdminTenant(currentUser: JwtPayload, request: CreateTenantRequest, ip?: string): Promise<TenantRecordItem> {
    const tenantName = normalizeText(request.name, 'name', 100);
    const softwareVersion = toPrismaTenantSoftwareVersion(request.softwareVersion);
    const ownerName = normalizeText(request.ownerName, 'ownerName', 50);
    const address = normalizeText(request.address, 'address', 255);
    const licenseNo = normalizeText(request.licenseNo, 'licenseNo', 100);
    const ownerAccount = normalizeText(request.ownerAccount, 'ownerAccount', 50);
    const ownerPassword = request.ownerInitialPassword?.trim() || DEFAULT_OWNER_PASSWORD;
    await this.ensureAccountAvailable(ownerAccount);
    await this.tenantPhoneIdentity.assertTenantPhoneAvailable(ownerAccount);
    const tenantId = await this.idGen.nextGlobalId(ID_CONFIG.TENANT.prefix, ID_CONFIG.TENANT.seqName, ID_CONFIG.TENANT.digits);
    const activePaymentChannel = this.toPrismaPaymentChannel(this.normalizePaymentChannel(request.channel));
    const serviceExpireAt = this.parseServiceExpireAt(request.serviceExpireAt);
    const passwordHash = await bcrypt.hash(ownerPassword, 10);

    const created = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          id: tenantId,
          name: tenantName,
          contactPhone: '',
          softwareVersion,
          adminName: ownerName,
          address,
          licenseNo,
          status: PrismaTenantStatusEnum.ONBOARDING,
          activePaymentChannel,
          serviceExpireAt,
        },
      });

      const owner = await tx.user.create({
        data: {
          tenantId: tenant.id,
          account: ownerAccount,
          phone: ownerAccount,
          passwordHash,
          realName: ownerName,
          role: UserRoleEnum.TENANT_OWNER,
          scope: 'tenant',
          status: UserStatusEnum.ACTIVE,
          requiresPasswordReset: true,
        },
      });

      await ensureTenantRbacBootstrap(tx, {
        tenantId: tenant.id,
        ownerUserId: owner.id,
        actorUserId: currentUser.userId,
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

      return this.findTenantRecordById(tx, tenant.id);
    });

    return toTenantRecordItem(created);
  }

  // 更新租户主体资料，不处理账号资料、状态动作和支付渠道切换
  async updateTenantBaseInfo(currentUser: JwtPayload, tenantId: string, request: UpdateTenantBaseInfoRequest, ip?: string): Promise<null> {
    const tenant = await getTenantOrThrow(this.prisma, tenantId);
    const tenantName = normalizeText(request.name, 'name', 100);
    const address = normalizeText(request.address, 'address', 255);
    const licenseNo = normalizeText(request.licenseNo, 'licenseNo', 100);
    const softwareVersion = toPrismaTenantSoftwareVersion(request.softwareVersion);
    const serviceExpireAt = this.parseServiceExpireAt(request.serviceExpireAt);

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenant.id },
        data: {
          name: tenantName,
          address,
          licenseNo,
          softwareVersion,
          serviceExpireAt,
        },
      });

      await createTenantAuditLog(tx, currentUser, {
        tenantId: tenant.id,
        action: '编辑租户主体资料',
        target: tenantName,
        targetType: PrismaAuditTargetTypeEnum.TENANT,
        ip,
      });
    });

    return null;
  }

  // 局部更新租户主体资料，只写入本次提交的字段
  async patchTenantBaseInfo(currentUser: JwtPayload, tenantId: string, request: PatchTenantBaseInfoRequest, ip?: string): Promise<null> {
    const tenant = await getTenantOrThrow(this.prisma, tenantId);
    const data: {
      name?: string;
      address?: string;
      licenseNo?: string;
      softwareVersion?: ReturnType<typeof toPrismaTenantSoftwareVersion>;
      serviceExpireAt?: Date;
    } = {};

    if (request.name !== undefined) data.name = normalizeText(request.name, 'name', 100);
    if (request.address !== undefined) data.address = normalizeText(request.address, 'address', 255);
    if (request.licenseNo !== undefined) data.licenseNo = normalizeText(request.licenseNo, 'licenseNo', 100);
    if (request.softwareVersion !== undefined) data.softwareVersion = toPrismaTenantSoftwareVersion(request.softwareVersion);
    if (request.serviceExpireAt !== undefined) data.serviceExpireAt = this.parseServiceExpireAt(request.serviceExpireAt);

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('至少提交一个可更新字段');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenant.id },
        data,
      });

      await createTenantAuditLog(tx, currentUser, {
        tenantId: tenant.id,
        action: '局部编辑租户主体资料',
        target: data.name ?? tenant.name,
        targetType: PrismaAuditTargetTypeEnum.TENANT,
        ip,
      });
    });

    return null;
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

  // 冻结单个租户，并记录冻结原因
  async freezeTenant(currentUser: JwtPayload, tenantId: string, request: FreezeTenantRequest, ip?: string): Promise<TenantStatusMutationResponse> {
    const tenant = await getTenantOrThrow(this.prisma, tenantId);
    const reason = normalizeText(request.reason, 'reason', 255);

    const updated = await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        status: PrismaTenantStatusEnum.PAUSED,
        freezeReason: reason,
      },
    });

    await createTenantAuditLog(this.prisma, currentUser, {
      tenantId: tenant.id,
      action: '冻结租户',
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

  // 解冻单个租户，并清空冻结原因
  async unfreezeTenant(currentUser: JwtPayload, tenantId: string, ip?: string): Promise<TenantStatusMutationResponse> {
    const tenant = await getTenantOrThrow(this.prisma, tenantId);

    const updated = await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        status: PrismaTenantStatusEnum.ACTIVE,
        freezeReason: null,
      },
    });

    await createTenantAuditLog(this.prisma, currentUser, {
      tenantId: tenant.id,
      action: '解冻租户',
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

  // 解析平台提交的服务到期日期，并归一为上海时区当天结束时刻
  private parseServiceExpireAt(value: string): Date {
    const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!matched) {
      throw new BadRequestException('serviceExpireAt 必须是 YYYY-MM-DD 日期格式');
    }

    const normalized = dayjs(value.trim(), 'YYYY-MM-DD', true);
    if (!normalized.isValid()) {
      throw new BadRequestException('serviceExpireAt 不是合法日期');
    }

    return normalized.endOf('day').toDate();
  }

  // 查询用于平台租户列表和编辑返回的租户记录快照
  private findTenantRecordById(client: Prisma.TransactionClient | PrismaService, tenantId: string) {
    return client.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: {
        users: {
          where: { deletedAt: null },
          select: { id: true, account: true, realName: true, role: true, loginAt: true, createdAt: true },
        },
        payments: {
          where: { paidAt: { gte: dayjs().startOf('month').toDate() } },
          select: { amount: true },
        },
      },
    });
  }

  // 归一化创建租户时提交的支付渠道字符串
  private normalizePaymentChannel(channel: string): PaymentChannel {
    switch (channel) {
      case PaymentChannelEnum.LAKALA:
      case PaymentChannelEnum.SHOUQIANBA:
      case PaymentChannelEnum.PINGAN_BANK:
        return channel;
      default:
        throw new BadRequestException('channel 不是合法支付渠道');
    }
  }

  // 解析创建租户时提交的首个生效支付渠道
  private toPrismaPaymentChannel(channel: PaymentChannel): PrismaPaymentChannelEnum {
    switch (channel) {
      case PaymentChannelEnum.LAKALA:
        return PrismaPaymentChannelEnum.LAKALA;
      case PaymentChannelEnum.SHOUQIANBA:
        return PrismaPaymentChannelEnum.SHOUQIANBA;
      case PaymentChannelEnum.PINGAN_BANK:
        return PrismaPaymentChannelEnum.PINGAN_BANK;
      default:
        throw new BadRequestException('channel 不是合法支付渠道');
    }
  }
}
