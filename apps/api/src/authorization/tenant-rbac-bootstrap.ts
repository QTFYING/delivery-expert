import type { Prisma } from '@prisma/client';
import { TenantRoleEnum, type TenantRole } from '@shou/types/enums';
import { DEFAULT_TENANT_ROLE_PERMISSIONS } from './tenant-permission.definition';

interface TenantBuiltinRoleDefinition {
  code: TenantRole;
  name: string;
  description: string;
  sortOrder: number;
}

const TENANT_BUILTIN_ROLES: readonly TenantBuiltinRoleDefinition[] = [
  { code: TenantRoleEnum.OWNER, name: '老板', description: '租户管理员，拥有全部管理权限', sortOrder: 10 },
  { code: TenantRoleEnum.FINANCE, name: '财务', description: '负责收款、核销、对账和账期管理', sortOrder: 20 },
  { code: TenantRoleEnum.OPERATOR, name: '打单员', description: '负责导单、查单和打印', sortOrder: 30 },
  { code: TenantRoleEnum.VIEWER, name: '访客', description: '只读查看基础业务数据', sortOrder: 40 },
];

export interface EnsureTenantRbacOptions {
  tenantId: string;
  ownerUserId: string;
  actorUserId?: string;
}

// 初始化租户内置角色和首个老板绑定，保证租户创建后可立即进入 Tenant 权限链路
export async function ensureTenantRbacBootstrap(client: Prisma.TransactionClient, options: EnsureTenantRbacOptions): Promise<void> {
  let ownerRoleId: string | null = null;

  for (const roleDefinition of TENANT_BUILTIN_ROLES) {
    const role = await client.tenantRole.upsert({
      where: {
        tenantId_code: {
          tenantId: options.tenantId,
          code: roleDefinition.code,
        },
      },
      create: {
        tenantId: options.tenantId,
        code: roleDefinition.code,
        name: roleDefinition.name,
        description: roleDefinition.description,
        isSystem: true,
        isEditable: false,
        sortOrder: roleDefinition.sortOrder,
        createdBy: options.actorUserId,
        updatedBy: options.actorUserId,
      },
      update: {
        name: roleDefinition.name,
        description: roleDefinition.description,
        isSystem: true,
        isEditable: false,
        sortOrder: roleDefinition.sortOrder,
        deletedAt: null,
        updatedBy: options.actorUserId,
      },
    });

    if (roleDefinition.code === TenantRoleEnum.OWNER) {
      ownerRoleId = role.id;
    }

    const permissions = DEFAULT_TENANT_ROLE_PERMISSIONS[roleDefinition.code];
    await client.tenantRolePermission.createMany({
      data: permissions.map((permissionCode) => ({
        roleId: role.id,
        permissionCode,
      })),
      skipDuplicates: true,
    });
  }

  if (!ownerRoleId) {
    throw new Error('TENANT_OWNER 内置角色初始化失败');
  }

  await client.userRoleAssignment.upsert({
    where: {
      tenantId_userId: {
        tenantId: options.tenantId,
        userId: options.ownerUserId,
      },
    },
    create: {
      tenantId: options.tenantId,
      userId: options.ownerUserId,
      roleId: ownerRoleId,
      isPrimary: true,
      createdBy: options.actorUserId,
    },
    update: {
      roleId: ownerRoleId,
      isPrimary: true,
    },
  });
}
