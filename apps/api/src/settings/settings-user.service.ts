import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditTargetTypeEnum as PrismaAuditTargetTypeEnum, UserRoleEnum, UserStatusEnum } from '@prisma/client';
import type { CreateTenantUserRequest, TenantSettingsUser, TenantUserStatusUpdateRequest, UpdateTenantUserRequest } from '@shou/types/contracts';
import { UserSimpleStatusEnum } from '@shou/types/enums';
import * as bcrypt from 'bcrypt';
import dayjs from 'dayjs';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { PermissionService } from '../authorization/permission.service';
import { normalizeText } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantPrismaRoles, toLegacyPrismaTenantRole, toPrismaTenantUserStatus, toTenantSettingsUser } from './mapping/settings.mapper';
import { SettingsRoleService } from './settings-role.service';
import { createAuditLog, getTenantSideId } from './settings.shared';

const DEFAULT_TENANT_USER_PASSWORD = '123456';
const USER_WITH_ROLE_ASSIGNMENT_INCLUDE = {
  roleAssignments: {
    where: { isPrimary: true },
    include: {
      role: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
    take: 1,
  },
} as const;

@Injectable()
export class SettingsUserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsRoleService: SettingsRoleService,
    private readonly permissionService: PermissionService,
  ) {}

  // 获取当前租户可见的用户列表，角色信息来自 user_role_assignments
  async getUsers(currentUser: JwtPayload): Promise<TenantSettingsUser[]> {
    const tenantId = getTenantSideId(currentUser);
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        deletedAt: null,
        role: {
          in: getTenantPrismaRoles(),
        },
      },
      include: USER_WITH_ROLE_ASSIGNMENT_INCLUDE,
      orderBy: [{ createdAt: 'asc' }],
    });

    return users.map((user) => toTenantSettingsUser(user));
  }

  // 创建当前租户下的新用户账号，并绑定当前租户内的角色 ID
  async createUser(currentUser: JwtPayload, request: CreateTenantUserRequest, ip?: string): Promise<TenantSettingsUser> {
    const tenantId = getTenantSideId(currentUser);
    const role = await this.settingsRoleService.getBindableRole(tenantId, request.roleId);
    const phone = this.normalizePhoneAsAccount(request.phone);
    const account = request.account !== undefined ? normalizeText(request.account, 'account', 50) : phone;
    await this.ensureAccountAvailable(account);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId,
          account,
          phone,
          passwordHash: await bcrypt.hash(DEFAULT_TENANT_USER_PASSWORD, 10),
          realName: normalizeText(request.name, 'name', 50),
          role: toLegacyPrismaTenantRole(role.code),
          scope: 'tenant',
          status: UserStatusEnum.ACTIVE,
          requiresPasswordReset: true,
        },
      });

      await tx.userRoleAssignment.create({
        data: {
          tenantId,
          userId: user.id,
          roleId: role.id,
          isPrimary: true,
          createdBy: currentUser.userId,
        },
      });

      return tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: USER_WITH_ROLE_ASSIGNMENT_INCLUDE,
      });
    });

    await createAuditLog(this.prisma, currentUser, {
      tenantId,
      action: '创建租户用户',
      target: created.realName || created.account,
      targetType: PrismaAuditTargetTypeEnum.ACCOUNT,
      ip,
    });

    return toTenantSettingsUser(created);
  }

  // 更新当前租户用户资料，并在传入 roleId 时更新角色绑定
  async updateUser(currentUser: JwtPayload, userId: string, request: UpdateTenantUserRequest, ip?: string): Promise<TenantSettingsUser> {
    const tenantId = getTenantSideId(currentUser);
    const existing = await this.getScopedTenantUser(tenantId, userId);
    const nextRole = request.roleId ? await this.settingsRoleService.getBindableRole(tenantId, request.roleId) : existing.roleAssignments[0]?.role;
    if (!nextRole) {
      throw new ConflictException('租户用户未绑定角色');
    }

    const currentRoleId = existing.roleAssignments[0]?.role.id;
    const roleChanged = request.roleId !== undefined && nextRole.id !== currentRoleId;
    const nextLegacyRole = toLegacyPrismaTenantRole(nextRole.code);
    const nextStatus = request.status ? toPrismaTenantUserStatus(request.status) : existing.status;
    const statusChanged = request.status !== undefined && nextStatus !== existing.status;
    const nextAccount = request.account !== undefined ? normalizeText(request.account, 'account', 50) : undefined;
    const nextPhone = request.phone !== undefined ? this.normalizePhoneAsAccount(request.phone) : undefined;
    const accountCandidate = nextAccount ?? nextPhone;
    if (accountCandidate && accountCandidate !== existing.account) {
      await this.ensureAccountAvailable(accountCandidate, existing.id);
    }
    await this.assertOwnerMutationAllowed(tenantId, existing, nextLegacyRole, nextStatus);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: existing.id },
        data: {
          realName: request.name !== undefined ? normalizeText(request.name, 'name', 50) : undefined,
          account: accountCandidate,
          phone: nextPhone,
          role: request.roleId ? nextLegacyRole : undefined,
          status: request.status ? nextStatus : undefined,
        },
      });

      if (request.roleId) {
        await tx.userRoleAssignment.upsert({
          where: {
            tenantId_userId: {
              tenantId,
              userId: existing.id,
            },
          },
          create: {
            tenantId,
            userId: existing.id,
            roleId: nextRole.id,
            isPrimary: true,
            createdBy: currentUser.userId,
          },
          update: {
            roleId: nextRole.id,
            isPrimary: true,
          },
        });
      }

      return tx.user.findUniqueOrThrow({
        where: { id: existing.id },
        include: USER_WITH_ROLE_ASSIGNMENT_INCLUDE,
      });
    });

    if (roleChanged || statusChanged) {
      await this.permissionService.invalidateTenantUserPermission(tenantId, existing.id);
    }

    await createAuditLog(this.prisma, currentUser, {
      tenantId,
      action: '更新租户用户',
      target: updated.realName || updated.account,
      targetType: PrismaAuditTargetTypeEnum.ACCOUNT,
      ip,
    });

    return toTenantSettingsUser(updated);
  }

  // 删除当前租户用户，并阻止删除最后一个老板账号
  async deleteUser(currentUser: JwtPayload, userId: string, ip?: string): Promise<null> {
    const tenantId = getTenantSideId(currentUser);
    const existing = await this.getScopedTenantUser(tenantId, userId);
    if (existing.id === currentUser.userId) {
      throw new ConflictException('TENANT_OWNER 不可删除自己');
    }
    await this.assertOwnerDeleteAllowed(tenantId, existing);

    await this.prisma.user.update({
      where: { id: existing.id },
      data: {
        deletedAt: new Date(),
        status: UserStatusEnum.DISABLED,
        account: `${existing.account}#deleted#${dayjs().valueOf()}`,
        phone: existing.phone ? `${existing.phone}#deleted` : existing.phone,
      },
    });

    await this.permissionService.invalidateTenantUserPermission(tenantId, existing.id);

    await createAuditLog(this.prisma, currentUser, {
      tenantId,
      action: '删除租户用户',
      target: existing.realName || existing.account,
      targetType: PrismaAuditTargetTypeEnum.ACCOUNT,
      ip,
    });

    return null;
  }

  // 更新当前租户用户状态，并阻止禁用最后一个可用老板账号
  async patchUserStatus(currentUser: JwtPayload, userId: string, request: TenantUserStatusUpdateRequest, ip?: string): Promise<TenantSettingsUser> {
    const tenantId = getTenantSideId(currentUser);
    const existing = await this.getScopedTenantUser(tenantId, userId);
    if (existing.id === currentUser.userId && request.status === UserSimpleStatusEnum.DISABLED) {
      throw new ConflictException('当前登录用户不能禁用自己');
    }
    await this.assertOwnerMutationAllowed(tenantId, existing, existing.role, toPrismaTenantUserStatus(request.status));

    const nextStatus = toPrismaTenantUserStatus(request.status);
    const updated = await this.prisma.user.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
      },
      include: USER_WITH_ROLE_ASSIGNMENT_INCLUDE,
    });

    if (nextStatus !== existing.status) {
      await this.permissionService.invalidateTenantUserPermission(tenantId, existing.id);
    }

    await createAuditLog(this.prisma, currentUser, {
      tenantId,
      action: '更新租户用户状态',
      target: updated.realName || updated.account,
      targetType: PrismaAuditTargetTypeEnum.ACCOUNT,
      ip,
    });

    return toTenantSettingsUser(updated);
  }

  // 查询当前租户作用域内的单个用户，并带出主角色绑定
  private async getScopedTenantUser(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
        deletedAt: null,
        role: {
          in: getTenantPrismaRoles(),
        },
      },
      include: USER_WITH_ROLE_ASSIGNMENT_INCLUDE,
    });

    if (!user) {
      throw new NotFoundException('租户用户不存在');
    }

    return user;
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

  // 归一化手机号并复用为租户侧默认登录账号
  private normalizePhoneAsAccount(value: string): string {
    return normalizeText(value, 'phone', 50);
  }

  // 阻止删除当前租户最后一个未删除的老板账号
  private async assertOwnerDeleteAllowed(
    tenantId: string,
    existing: {
      id: string;
      role: UserRoleEnum;
      status: UserStatusEnum;
    },
  ): Promise<void> {
    if (existing.role !== UserRoleEnum.TENANT_OWNER) {
      return;
    }

    const ownerCount = await this.countRemainingOwners(tenantId, existing.id);
    if (ownerCount === 0) {
      throw new ConflictException('不能删除最后一个老板账号');
    }

    if (existing.status === UserStatusEnum.ACTIVE) {
      const activeOwnerCount = await this.countRemainingActiveOwners(tenantId, existing.id);
      if (activeOwnerCount === 0) {
        throw new ConflictException('不能删除最后一个可用老板账号');
      }
    }
  }

  // 阻止把最后一个老板账号改成非老板，或把最后一个可用老板账号改成不可用
  private async assertOwnerMutationAllowed(
    tenantId: string,
    existing: {
      id: string;
      role: UserRoleEnum;
      status: UserStatusEnum;
    },
    nextRole: UserRoleEnum,
    nextStatus: UserStatusEnum,
  ): Promise<void> {
    if (existing.role !== UserRoleEnum.TENANT_OWNER) {
      return;
    }

    if (nextRole !== UserRoleEnum.TENANT_OWNER) {
      const ownerCount = await this.countRemainingOwners(tenantId, existing.id);
      if (ownerCount === 0) {
        throw new ConflictException('不能移除最后一个老板账号');
      }

      if (existing.status === UserStatusEnum.ACTIVE) {
        const activeOwnerCount = await this.countRemainingActiveOwners(tenantId, existing.id);
        if (activeOwnerCount === 0) {
          throw new ConflictException('不能移除最后一个可用老板账号');
        }
      }
    }

    if (existing.status === UserStatusEnum.ACTIVE && nextStatus !== UserStatusEnum.ACTIVE) {
      const activeOwnerCount = await this.countRemainingActiveOwners(tenantId, existing.id);
      if (activeOwnerCount === 0) {
        throw new ConflictException('不能禁用最后一个可用老板账号');
      }
    }
  }

  // 统计当前租户除指定用户外剩余的老板账号数量
  private async countRemainingOwners(tenantId: string, excludeUserId: string): Promise<number> {
    return this.prisma.user.count({
      where: {
        tenantId,
        deletedAt: null,
        role: UserRoleEnum.TENANT_OWNER,
        id: { not: excludeUserId },
      },
    });
  }

  // 统计当前租户除指定用户外剩余的可用老板账号数量
  private async countRemainingActiveOwners(tenantId: string, excludeUserId: string): Promise<number> {
    return this.prisma.user.count({
      where: {
        tenantId,
        deletedAt: null,
        role: UserRoleEnum.TENANT_OWNER,
        status: UserStatusEnum.ACTIVE,
        id: { not: excludeUserId },
      },
    });
  }
}
