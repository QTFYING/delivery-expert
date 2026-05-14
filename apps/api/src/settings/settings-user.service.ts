import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditTargetTypeEnum as PrismaAuditTargetTypeEnum, UserRoleEnum, UserStatusEnum } from '@prisma/client';
import type {
  CreateTenantUserRequest,
  TenantRoleAccount,
  TenantSettingsUser,
  TenantUserStatusUpdateRequest,
  UpdateTenantUserRequest,
} from '@shou/types/contracts';
import { TenantRoleEnum, UserSimpleStatusEnum } from '@shou/types/enums';
import * as bcrypt from 'bcrypt';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { assertPasswordStrength, normalizeText } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantPrismaRoles, toPrismaTenantUserStatus, toTenantPrismaRole, toTenantSettingsUser } from './mapping/settings.mapper';
import { createAuditLog, getTenantSideId } from './settings.shared';

const DEFAULT_TENANT_USER_PASSWORD = '123456';

const TENANT_ROLE_DEFINITIONS: Array<{
  role: (typeof TenantRoleEnum)[keyof typeof TenantRoleEnum];
  name: string;
  description: string;
  permissions: string[];
}> = [
  {
    role: TenantRoleEnum.OWNER,
    name: '老板',
    description: '租户管理员，拥有全部管理权限',
    permissions: [
      'dashboard',
      'orders',
      'orders.view',
      'orders.import',
      'orders.print',
      'printing',
      'printing.view',
      'printing.manage',
      'finance',
      'finance.summary',
      'finance.reconciliation',
      'finance.credit',
      'finance.export',
      'settings',
      'settings.general', // 基础设置
      'settings.mapping', // 映射配置
      'settings.printing', // 打印设置
      'settings.roles', // 角色管理
      'settings.users', // 用户管理
    ],
  },
  {
    role: TenantRoleEnum.OPERATOR,
    name: '打单员',
    description: '负责导单、查单和打印',
    permissions: ['dashboard', 'orders', 'orders.view', 'orders.import', 'orders.print', 'printing.view'],
  },
  {
    role: TenantRoleEnum.FINANCE,
    name: '财务',
    description: '负责收款、核销、对账和账期管理',
    permissions: ['dashboard', 'orders.view', 'finance', 'finance.summary', 'finance.reconciliation', 'finance.credit', 'finance.export'],
  },
  {
    role: TenantRoleEnum.VIEWER,
    name: '访客',
    description: '只读查看业务数据',
    permissions: ['dashboard', 'orders.view', 'finance.summary'],
  },
];

@Injectable()
export class SettingsUserService {
  constructor(private readonly prisma: PrismaService) {}

  // 获取当前租户的内置角色定义与占用数量
  async getRoles(currentUser: JwtPayload): Promise<TenantRoleAccount[]> {
    const tenantId = getTenantSideId(currentUser);
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        deletedAt: null,
        role: {
          in: getTenantPrismaRoles(),
        },
      },
      select: {
        role: true,
      },
    });

    return TENANT_ROLE_DEFINITIONS.map((item) => ({
      id: item.role,
      name: item.name,
      description: item.description,
      permissions: item.permissions,
      isSystem: true,
      userCount: users.filter((user) => user.role === item.role).length,
    }));
  }

  // 获取当前租户可见的用户列表
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
      orderBy: [{ createdAt: 'asc' }],
    });

    return users.map((user) => toTenantSettingsUser(user));
  }

  // 创建当前租户下的新用户账号
  async createUser(currentUser: JwtPayload, request: CreateTenantUserRequest, ip?: string): Promise<TenantSettingsUser> {
    const tenantId = getTenantSideId(currentUser);
    const account = this.normalizePhoneAsAccount(request.phone);
    await this.ensureAccountAvailable(account);
    const customPassword = request.password === undefined || request.password === '' ? undefined : assertPasswordStrength(request.password);

    const created = await this.prisma.user.create({
      data: {
        tenantId,
        account,
        phone: account,
        passwordHash: await bcrypt.hash(customPassword ?? DEFAULT_TENANT_USER_PASSWORD, 10),
        realName: normalizeText(request.name, 'name', 50),
        role: toTenantPrismaRole(request.role),
        scope: 'tenant',
        status: UserStatusEnum.ACTIVE,
        requiresPasswordReset: !customPassword,
      },
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

  // 更新当前租户用户，并阻止移除最后一个老板账号
  async updateUser(currentUser: JwtPayload, userId: string, request: UpdateTenantUserRequest, ip?: string): Promise<TenantSettingsUser> {
    const tenantId = getTenantSideId(currentUser);
    const existing = await this.getScopedTenantUser(tenantId, userId);
    const nextRole = request.role ? toTenantPrismaRole(request.role) : existing.role;
    const nextStatus = request.status ? toPrismaTenantUserStatus(request.status) : existing.status;

    const nextAccount = request.account !== undefined ? normalizeText(request.account, 'account', 50) : undefined;
    const nextPhone = request.phone !== undefined ? this.normalizePhoneAsAccount(request.phone) : undefined;
    const accountCandidate = nextPhone ?? nextAccount;
    if (accountCandidate && accountCandidate !== existing.account) {
      await this.ensureAccountAvailable(accountCandidate, existing.id);
    }
    await this.assertOwnerMutationAllowed(tenantId, existing, nextRole, nextStatus);

    const updated = await this.prisma.user.update({
      where: { id: existing.id },
      data: {
        realName: request.name !== undefined ? normalizeText(request.name, 'name', 50) : undefined,
        account: accountCandidate,
        phone: nextPhone ?? request.phone,
        role: request.role ? nextRole : undefined,
        status: request.status ? nextStatus : undefined,
      },
    });

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
        account: `${existing.account}#deleted#${Date.now()}`,
        phone: existing.phone ? `${existing.phone}#deleted` : existing.phone,
      },
    });

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

    const updated = await this.prisma.user.update({
      where: { id: existing.id },
      data: {
        status: toPrismaTenantUserStatus(request.status),
      },
    });

    await createAuditLog(this.prisma, currentUser, {
      tenantId,
      action: '更新租户用户状态',
      target: updated.realName || updated.account,
      targetType: PrismaAuditTargetTypeEnum.ACCOUNT,
      ip,
    });

    return toTenantSettingsUser(updated);
  }

  // 查询当前租户作用域内的单个用户
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
