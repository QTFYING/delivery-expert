import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditTargetTypeEnum as PrismaAuditTargetTypeEnum } from '@prisma/client';
import type { CreateTenantRoleRequest, TenantRoleAccount, UpdateTenantRoleRequest } from '@shou/types/contracts';
import type { TenantPermissionCode } from '@shou/types/enums';
import * as crypto from 'crypto';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { PermissionService } from '../authorization/permission.service';
import { assertTenantPermissionCodes } from '../authorization/tenant-permission.definition';
import { normalizeText } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import { createAuditLog, getTenantSideId } from './settings.shared';

@Injectable()
export class SettingsRoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  // 获取当前租户真实角色列表 包括内置角色和自定义角色
  async getRoles(currentUser: JwtPayload): Promise<TenantRoleAccount[]> {
    const tenantId = getTenantSideId(currentUser);
    const roles = await this.prisma.tenantRole.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      include: {
        permissions: {
          orderBy: { permissionCode: 'asc' },
        },
        userAssignments: {
          where: {
            user: { deletedAt: null },
          },
          select: { userId: true },
        },
      },
      orderBy: [{ isSystem: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return roles.map((role) => this.toTenantRoleAccount(role));
  }

  // 创建当前租户自定义角色 权限编码只接受服务端闭集
  async createRole(currentUser: JwtPayload, request: CreateTenantRoleRequest, ip?: string): Promise<TenantRoleAccount> {
    const tenantId = getTenantSideId(currentUser);
    const name = normalizeText(request.name, 'name', 50);
    const description = request.description !== undefined ? normalizeText(request.description, 'description', 255) : undefined;
    const permissionCodes = this.assertCustomRolePermissions(request.permissionCodes);
    await this.ensureRoleNameAvailable(tenantId, name);

    const created = await this.prisma.$transaction(async (tx) => {
      const role = await tx.tenantRole.create({
        data: {
          tenantId,
          code: `CUSTOM_${crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`,
          name,
          description,
          isSystem: false,
          isEditable: true,
          sortOrder: 100,
          createdBy: currentUser.userId,
          updatedBy: currentUser.userId,
        },
      });

      await tx.tenantRolePermission.createMany({
        data: permissionCodes.map((permissionCode) => ({
          roleId: role.id,
          permissionCode,
        })),
        skipDuplicates: true,
      });

      return tx.tenantRole.findUniqueOrThrow({
        where: { id: role.id },
        include: {
          permissions: { orderBy: { permissionCode: 'asc' } },
          userAssignments: {
            where: {
              user: { deletedAt: null },
            },
            select: { userId: true },
          },
        },
      });
    });

    await createAuditLog(this.prisma, currentUser, {
      tenantId,
      action: '创建租户角色',
      target: created.name,
      targetType: PrismaAuditTargetTypeEnum.ROLE,
      ip,
    });

    return this.toTenantRoleAccount(created);
  }

  // 更新当前租户自定义角色 内置角色第一版不可编辑
  async updateRole(currentUser: JwtPayload, roleId: string, request: UpdateTenantRoleRequest, ip?: string): Promise<TenantRoleAccount> {
    const tenantId = getTenantSideId(currentUser);
    const existing = await this.getScopedRole(tenantId, roleId);
    if (!existing.isEditable || existing.isSystem) {
      throw new ConflictException('内置角色不可编辑');
    }

    const name = request.name !== undefined ? normalizeText(request.name, 'name', 50) : undefined;
    const description = request.description !== undefined ? normalizeText(request.description, 'description', 255) : undefined;
    const permissionCodes = request.permissionCodes !== undefined ? this.assertCustomRolePermissions(request.permissionCodes) : undefined;
    if (name && name !== existing.name) {
      await this.ensureRoleNameAvailable(tenantId, name, existing.id);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.tenantRole.update({
        where: { id: existing.id },
        data: {
          name,
          description,
          updatedBy: currentUser.userId,
        },
      });

      if (permissionCodes) {
        await tx.tenantRolePermission.deleteMany({ where: { roleId: existing.id } });
        await tx.tenantRolePermission.createMany({
          data: permissionCodes.map((permissionCode) => ({
            roleId: existing.id,
            permissionCode,
          })),
          skipDuplicates: true,
        });
      }

      return tx.tenantRole.findUniqueOrThrow({
        where: { id: existing.id },
        include: {
          permissions: { orderBy: { permissionCode: 'asc' } },
          userAssignments: {
            where: {
              user: { deletedAt: null },
            },
            select: { userId: true },
          },
        },
      });
    });

    if (permissionCodes) {
      await this.permissionService.invalidateTenantRoleUsersPermissions(tenantId, existing.id);
    }

    await createAuditLog(this.prisma, currentUser, {
      tenantId,
      action: '更新租户角色',
      target: updated.name,
      targetType: PrismaAuditTargetTypeEnum.ROLE,
      ip,
    });

    return this.toTenantRoleAccount(updated);
  }

  // 删除当前租户自定义角色 已绑定用户的角色不可删除
  async deleteRole(currentUser: JwtPayload, roleId: string, ip?: string): Promise<null> {
    const tenantId = getTenantSideId(currentUser);
    const existing = await this.getScopedRole(tenantId, roleId);
    if (existing.isSystem) {
      throw new ConflictException('内置角色不可删除');
    }

    const boundUserCount = await this.prisma.userRoleAssignment.count({
      where: {
        tenantId,
        roleId: existing.id,
      },
    });
    if (boundUserCount > 0) {
      throw new ConflictException('角色已绑定用户，不能删除');
    }

    await this.prisma.tenantRole.update({
      where: { id: existing.id },
      data: {
        deletedAt: new Date(),
        updatedBy: currentUser.userId,
      },
    });

    await createAuditLog(this.prisma, currentUser, {
      tenantId,
      action: '删除租户角色',
      target: existing.name,
      targetType: PrismaAuditTargetTypeEnum.ROLE,
      ip,
    });

    return null;
  }

  // 校验角色 ID 属于当前租户且未删除 返回供用户绑定使用的角色摘要
  async getBindableRole(tenantId: string, roleId: string) {
    return this.getScopedRole(tenantId, roleId);
  }

  // 查询当前租户作用域内的角色 所有角色读取都带 tenantId 边界
  private async getScopedRole(tenantId: string, roleId: string) {
    const role = await this.prisma.tenantRole.findFirst({
      where: {
        id: roleId,
        tenantId,
        deletedAt: null,
      },
    });

    if (!role) {
      throw new NotFoundException('租户角色不存在');
    }

    return role;
  }

  // 校验当前租户未删除角色名称唯一
  private async ensureRoleNameAvailable(tenantId: string, name: string, excludeRoleId?: string): Promise<void> {
    const existing = await this.prisma.tenantRole.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        name: {
          equals: name,
          mode: 'insensitive',
        },
        id: excludeRoleId ? { not: excludeRoleId } : undefined,
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('角色名称已存在');
    }
  }

  // 自定义角色必须至少包含一个合法权限编码
  private assertCustomRolePermissions(values: readonly string[]): TenantPermissionCode[] {
    const permissions = assertTenantPermissionCodes(values);
    if (permissions.length === 0) {
      throw new BadRequestException('角色至少需要包含一个权限');
    }

    return permissions;
  }

  // 将 Prisma 角色聚合结果映射为设置页角色契约
  private toTenantRoleAccount(role: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    permissions: Array<{ permissionCode: string }>;
    isSystem: boolean;
    isEditable: boolean;
    createdAt: Date;
    updatedAt: Date;
    userAssignments: Array<{ userId: string }>;
  }): TenantRoleAccount {
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description ?? undefined,
      permissions: assertTenantPermissionCodes(role.permissions.map((permission) => permission.permissionCode)),
      isSystem: role.isSystem,
      isEditable: role.isEditable,
      userCount: role.userAssignments.length,
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
    };
  }
}
