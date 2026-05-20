import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  AuditTargetTypeEnum as PrismaAuditTargetTypeEnum,
  UserRoleEnum as PrismaUserRoleEnum,
  UserStatusEnum as PrismaUserStatusEnum,
} from '@prisma/client';
import type { PaginatedResponse } from '@shou/types/common';
import type {
  CreateUserPasswordResetRequest,
  CreateUserPasswordResetResponse,
  UserListQuery,
  UserRecordItem,
  UserStatusUpdateRequest,
  UserUpsertRequest,
} from '@shou/types/contracts';
import { TenantSideEnum, UserStatusEnum, type UserRole } from '@shou/types/enums';
import * as bcrypt from 'bcrypt';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { formatDateTime, normalizePage, normalizePageSize, normalizeText } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import { resolveUserRoleForUpsert, toPrismaUserRole, toPrismaUserStatus, toUserRecordItem } from './mapping/tenant.mapper';
import { createTenantAuditLog } from './tenant.shared';

const DEFAULT_USER_PASSWORD = '123456';

@Injectable()
export class OsUserService {
  constructor(private readonly prisma: PrismaService) {}

  // 获取平台用户分页列表
  async getAdminUsers(query: UserListQuery): Promise<PaginatedResponse<UserRecordItem>> {
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize);
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
    };

    if (query.keyword?.trim()) {
      const keyword = query.keyword.trim();
      where.OR = [
        { realName: { contains: keyword, mode: 'insensitive' } },
        { account: { contains: keyword, mode: 'insensitive' } },
        { phone: { contains: keyword, mode: 'insensitive' } },
      ];
    }
    if (query.role?.trim()) {
      where.role = toPrismaUserRole(query.role.trim() as UserRole);
    }
    if (query.tenant?.trim()) {
      const keyword = query.tenant.trim();
      where.tenant = {
        OR: [{ id: keyword }, { name: { contains: keyword, mode: 'insensitive' } }],
      };
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { tenant: true },
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      list: users.map((item) => ({
        ...toUserRecordItem(item),
        loginAt: formatDateTime(item.loginAt) ?? '',
      })),
      total,
      page,
      pageSize,
    };
  }

  // 创建平台用户并写入审计日志
  async createAdminUser(currentUser: JwtPayload, request: UserUpsertRequest, ip?: string): Promise<UserRecordItem> {
    const account = normalizeText(request.account, 'account', 50);
    await this.ensureAccountAvailable(account);
    const tenantId = await this.resolveTenantIdForUser(request.tenantType, request.tenant);
    const role = resolveUserRoleForUpsert(request.tenantType, request.role);
    const status = toPrismaUserStatus(request.status ?? UserStatusEnum.ACTIVE);

    const created = await this.prisma.user.create({
      data: {
        tenantId,
        account,
        phone: normalizeText(request.phone, 'phone', 20),
        passwordHash: await bcrypt.hash(DEFAULT_USER_PASSWORD, 10),
        realName: normalizeText(request.name, 'name', 50),
        role,
        scope: normalizeText(request.scope, 'scope', 100),
        status,
        requiresPasswordReset: true,
      },
      include: { tenant: true },
    });

    await createTenantAuditLog(this.prisma, currentUser, {
      tenantId: created.tenantId,
      action: '创建平台用户',
      target: created.realName || created.account,
      targetType: PrismaAuditTargetTypeEnum.ACCOUNT,
      ip,
    });

    return toUserRecordItem(created);
  }

  // 更新平台用户并写入审计日志
  async updateAdminUser(currentUser: JwtPayload, userId: string, request: UserUpsertRequest, ip?: string): Promise<UserRecordItem> {
    const existing = await this.getAdminUserOrThrow(userId);
    const account = normalizeText(request.account, 'account', 50);
    if (account !== existing.account) {
      await this.ensureAccountAvailable(account, existing.id);
    }

    const tenantId = await this.resolveTenantIdForUser(request.tenantType, request.tenant);
    const role = resolveUserRoleForUpsert(request.tenantType, request.role);
    const nextStatus = request.status ? toPrismaUserStatus(request.status) : existing.status;
    await this.assertOwnerMutationAllowed(existing, tenantId, role, nextStatus);
    const updated = await this.prisma.user.update({
      where: { id: existing.id },
      data: {
        tenantId,
        account,
        phone: normalizeText(request.phone, 'phone', 20),
        realName: normalizeText(request.name, 'name', 50),
        role,
        scope: normalizeText(request.scope, 'scope', 100),
        status: request.status ? nextStatus : undefined,
      },
      include: { tenant: true },
    });

    await createTenantAuditLog(this.prisma, currentUser, {
      tenantId: updated.tenantId,
      action: '更新平台用户',
      target: updated.realName || updated.account,
      targetType: PrismaAuditTargetTypeEnum.ACCOUNT,
      ip,
    });

    return toUserRecordItem(updated);
  }

  // 删除平台用户并写入审计日志
  async deleteAdminUser(currentUser: JwtPayload, userId: string, ip?: string): Promise<null> {
    const existing = await this.getAdminUserOrThrow(userId);
    if (existing.id === currentUser.userId) {
      throw new ConflictException('当前登录用户不能删除自己');
    }
    await this.assertOwnerDeleteAllowed(existing);

    await this.prisma.user.update({
      where: { id: existing.id },
      data: {
        deletedAt: new Date(),
        status: PrismaUserStatusEnum.DISABLED,
        account: `${existing.account}#deleted#${Date.now()}`,
        phone: existing.phone ? `${existing.phone}#deleted` : existing.phone,
      },
    });

    await createTenantAuditLog(this.prisma, currentUser, {
      tenantId: existing.tenantId,
      action: '删除平台用户',
      target: existing.realName || existing.account,
      targetType: PrismaAuditTargetTypeEnum.ACCOUNT,
      ip,
    });

    return null;
  }

  // 更新平台用户状态并写入审计日志
  async patchAdminUserStatus(currentUser: JwtPayload, userId: string, request: UserStatusUpdateRequest, ip?: string): Promise<UserRecordItem> {
    const existing = await this.getAdminUserOrThrow(userId);
    if (existing.id === currentUser.userId && request.status !== UserStatusEnum.ACTIVE) {
      throw new ConflictException('当前登录用户不能修改自己的不可用状态');
    }
    const nextStatus = toPrismaUserStatus(request.status);
    await this.assertOwnerMutationAllowed(existing, existing.tenantId, existing.role, nextStatus);

    const updated = await this.prisma.user.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
      },
      include: { tenant: true },
    });

    await createTenantAuditLog(this.prisma, currentUser, {
      tenantId: updated.tenantId,
      action: '更新平台用户状态',
      target: updated.realName || updated.account,
      targetType: PrismaAuditTargetTypeEnum.ACCOUNT,
      ip,
    });

    return toUserRecordItem(updated);
  }

  // 重置平台用户密码并写入审计日志
  async resetAdminUserPassword(
    currentUser: JwtPayload,
    userId: string,
    request: CreateUserPasswordResetRequest,
    ip?: string,
  ): Promise<CreateUserPasswordResetResponse> {
    const existing = await this.getAdminUserOrThrow(userId);
    await this.prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash: await bcrypt.hash(request.password?.trim() || DEFAULT_USER_PASSWORD, 10),
        requiresPasswordReset: true,
      },
    });

    await createTenantAuditLog(this.prisma, currentUser, {
      tenantId: existing.tenantId,
      action: '重置用户密码',
      target: existing.realName || existing.account,
      targetType: PrismaAuditTargetTypeEnum.ACCOUNT,
      ip,
    });

    return {
      requiresPasswordReset: true,
    };
  }

  // 查询未删除的平台用户并在缺失时抛出异常
  private async getAdminUserOrThrow(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      include: { tenant: true },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user;
  }

  // 解析平台用户所属租户 ID
  private async resolveTenantIdForUser(tenantType: string, tenant: string): Promise<string | null> {
    if (tenantType === TenantSideEnum.PLATFORM) {
      return null;
    }
    if (tenantType !== TenantSideEnum.TENANT) {
      throw new BadRequestException('tenantType 不是合法值');
    }

    const keyword = tenant.trim();
    if (!keyword) {
      throw new BadRequestException('tenant 不能为空');
    }

    const matched = await this.prisma.tenant.findFirst({
      where: {
        deletedAt: null,
        OR: [{ id: keyword }, { name: keyword }],
      },
      select: { id: true },
    });
    if (!matched) {
      throw new NotFoundException('所属租户不存在');
    }

    return matched.id;
  }

  // 校验登录账号是否可用
  private async ensureAccountAvailable(account: string, excludeUserId?: string): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: {
        account,
        deletedAt: null,
        id: excludeUserId ? { not: excludeUserId } : undefined,
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('登录账号已存在');
    }
  }

  // 阻止删除最后一个老板账号或最后一个可用老板账号
  private async assertOwnerDeleteAllowed(existing: {
    id: string;
    tenantId: string | null;
    role: PrismaUserRoleEnum;
    status: PrismaUserStatusEnum;
  }): Promise<void> {
    if (!existing.tenantId || existing.role !== PrismaUserRoleEnum.TENANT_OWNER) {
      return;
    }

    const ownerCount = await this.countRemainingOwners(existing.tenantId, existing.id);
    if (ownerCount === 0) {
      throw new ConflictException('不能删除最后一个老板账号');
    }

    if (existing.status === PrismaUserStatusEnum.ACTIVE) {
      const activeOwnerCount = await this.countRemainingActiveOwners(existing.tenantId, existing.id);
      if (activeOwnerCount === 0) {
        throw new ConflictException('不能删除最后一个可用老板账号');
      }
    }
  }

  // 阻止把最后一个老板账号改成非老板、迁出当前租户或改成不可用
  private async assertOwnerMutationAllowed(
    existing: {
      id: string;
      tenantId: string | null;
      role: PrismaUserRoleEnum;
      status: PrismaUserStatusEnum;
    },
    nextTenantId: string | null,
    nextRole: PrismaUserRoleEnum,
    nextStatus: PrismaUserStatusEnum,
  ): Promise<void> {
    if (!existing.tenantId || existing.role !== PrismaUserRoleEnum.TENANT_OWNER) {
      return;
    }

    const ownerMovedOut = nextTenantId !== existing.tenantId;
    const ownerRoleRemoved = nextRole !== PrismaUserRoleEnum.TENANT_OWNER;
    if (ownerMovedOut || ownerRoleRemoved) {
      const ownerCount = await this.countRemainingOwners(existing.tenantId, existing.id);
      if (ownerCount === 0) {
        throw new ConflictException(ownerMovedOut ? '不能迁出最后一个老板账号' : '不能移除最后一个老板账号');
      }

      if (existing.status === PrismaUserStatusEnum.ACTIVE) {
        const activeOwnerCount = await this.countRemainingActiveOwners(existing.tenantId, existing.id);
        if (activeOwnerCount === 0) {
          throw new ConflictException(ownerMovedOut ? '不能迁出最后一个可用老板账号' : '不能移除最后一个可用老板账号');
        }
      }
    }

    if (existing.status === PrismaUserStatusEnum.ACTIVE && nextStatus !== PrismaUserStatusEnum.ACTIVE) {
      const activeOwnerCount = await this.countRemainingActiveOwners(existing.tenantId, existing.id);
      if (activeOwnerCount === 0) {
        throw new ConflictException('不能禁用最后一个可用老板账号');
      }
    }
  }

  // 统计某租户除指定用户外剩余的老板账号数量
  private async countRemainingOwners(tenantId: string, excludeUserId: string): Promise<number> {
    return this.prisma.user.count({
      where: {
        tenantId,
        deletedAt: null,
        role: PrismaUserRoleEnum.TENANT_OWNER,
        id: { not: excludeUserId },
      },
    });
  }

  // 统计某租户除指定用户外剩余的可用老板账号数量
  private async countRemainingActiveOwners(tenantId: string, excludeUserId: string): Promise<number> {
    return this.prisma.user.count({
      where: {
        tenantId,
        deletedAt: null,
        role: PrismaUserRoleEnum.TENANT_OWNER,
        status: PrismaUserStatusEnum.ACTIVE,
        id: { not: excludeUserId },
      },
    });
  }
}
