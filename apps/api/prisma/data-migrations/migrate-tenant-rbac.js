const { PrismaClient, UserRoleEnum } = require('@prisma/client');
const { TenantPermissionCodeEnum } = require('@shou/types/enums');

const args = process.argv.slice(2);
const allowedArgs = new Set(['--dry-run', '--apply']);
const unknownArgs = args.filter((arg) => !allowedArgs.has(arg));
const applyRequested = args.includes('--apply');
const dryRunRequested = args.includes('--dry-run');

if (unknownArgs.length > 0) {
  console.error(`未知参数：${unknownArgs.join(', ')}。仅支持 --dry-run 或 --apply。`);
  process.exit(1);
}

if (applyRequested && dryRunRequested) {
  console.error('参数冲突：--dry-run 与 --apply 不能同时使用。');
  process.exit(1);
}

const prisma = new PrismaClient();
let writeEnabled = false;

const ROLE_CODES = {
  OWNER: 'TENANT_OWNER',
  OPERATOR: 'TENANT_OPERATOR',
  FINANCE: 'TENANT_FINANCE',
  VIEWER: 'TENANT_VIEWER',
};

const ALL_PERMISSIONS = Object.values(TenantPermissionCodeEnum);

const BUILTIN_ROLES = [
  {
    code: ROLE_CODES.OWNER,
    name: '老板',
    description: '租户管理员，拥有全部管理权限',
    sortOrder: 10,
    permissions: ALL_PERMISSIONS,
  },
  {
    code: ROLE_CODES.FINANCE,
    name: '财务',
    description: '负责收款、核销、对账和账期管理',
    sortOrder: 20,
    permissions: [
      TenantPermissionCodeEnum.ANALYTICS_READ,
      TenantPermissionCodeEnum.ORDERS_READ,
      TenantPermissionCodeEnum.ORDERS_REMINDER_CREATE,
      TenantPermissionCodeEnum.TEMPLATES_READ,
      TenantPermissionCodeEnum.CREDIT_READ,
      TenantPermissionCodeEnum.CREDIT_RECEIPT_CREATE,
      TenantPermissionCodeEnum.PAYMENTS_READ,
      TenantPermissionCodeEnum.PAYMENTS_CASH_VERIFY_CREATE,
      TenantPermissionCodeEnum.FINANCE_READ,
      TenantPermissionCodeEnum.FINANCE_EXPORT,
      TenantPermissionCodeEnum.SETTINGS_PAYMENT_CONFIGS_READ,
      TenantPermissionCodeEnum.TENANT_PROFILE_READ,
      TenantPermissionCodeEnum.NOTIFICATIONS_READ,
      TenantPermissionCodeEnum.NOTIFICATIONS_MANAGE,
    ],
  },
  {
    code: ROLE_CODES.OPERATOR,
    name: '打单员',
    description: '负责导单、查单和打印',
    sortOrder: 30,
    permissions: [
      TenantPermissionCodeEnum.ORDERS_READ,
      TenantPermissionCodeEnum.ORDERS_MANAGE,
      TenantPermissionCodeEnum.ORDERS_IMPORT_MANAGE,
      TenantPermissionCodeEnum.ORDERS_PRINT_MANAGE,
      TenantPermissionCodeEnum.TEMPLATES_READ,
      TenantPermissionCodeEnum.TEMPLATES_MANAGE,
      TenantPermissionCodeEnum.SETTINGS_PRINTING_READ,
      TenantPermissionCodeEnum.TENANT_PROFILE_READ,
      TenantPermissionCodeEnum.NOTIFICATIONS_READ,
      TenantPermissionCodeEnum.NOTIFICATIONS_MANAGE,
    ],
  },
  {
    code: ROLE_CODES.VIEWER,
    name: '访客',
    description: '只读查看基础业务数据',
    sortOrder: 40,
    permissions: [
      TenantPermissionCodeEnum.ANALYTICS_READ,
      TenantPermissionCodeEnum.ORDERS_READ,
      TenantPermissionCodeEnum.TEMPLATES_READ,
      TenantPermissionCodeEnum.TENANT_PROFILE_READ,
      TenantPermissionCodeEnum.NOTIFICATIONS_READ,
    ],
  },
];

const ROLE_BY_CODE = new Map(BUILTIN_ROLES.map((role) => [role.code, role]));

function createReport(phase) {
  return {
    phase,
    dryRun: !writeEnabled,
    applyRequested,
    blockedReason: null,
    tenantsProcessed: 0,
    rolesCreated: 0,
    rolesUpdated: 0,
    rolePermissionsCreated: 0,
    userRoleAssignmentsCreated: 0,
    usersSkipped: 0,
    usersAlreadyBound: 0,
    abnormalUsers: [],
    conflicts: [],
  };
}

let report = createReport('preflight');

async function ensureTargetTablesExist() {
  const rows = await prisma.$queryRaw`
    SELECT
      to_regclass('public.tenant_roles')::text AS "tenantRoles",
      to_regclass('public.tenant_role_permissions')::text AS "tenantRolePermissions",
      to_regclass('public.user_role_assignments')::text AS "userRoleAssignments"
  `;
  const row = rows[0];
  const missingTables = [];

  if (!row.tenantRoles) missingTables.push('tenant_roles');
  if (!row.tenantRolePermissions) missingTables.push('tenant_role_permissions');
  if (!row.userRoleAssignments) missingTables.push('user_role_assignments');

  if (missingTables.length > 0) {
    report.blockedReason = `缺少 RBAC 目标表：${missingTables.join(', ')}。请先应用 T02 结构迁移。`;
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return false;
  }

  return true;
}

function recordAbnormalUser(user, reason) {
  report.abnormalUsers.push({
    userId: user.id,
    tenantId: user.tenantId,
    account: user.account,
    role: user.role,
    reason,
  });
}

function recordConflict(user, existing, expectedRole) {
  report.conflicts.push({
    userId: user.id,
    tenantId: user.tenantId,
    account: user.account,
    expectedRoleCode: expectedRole.code,
    expectedRoleId: expectedRole.id,
    existingAssignmentId: existing.id,
    existingRoleId: existing.roleId,
    existingRoleCode: existing.role?.code,
    existingRoleName: existing.role?.name,
  });
}

function createDryRunRole(tenantId, roleDefinition) {
  return {
    id: `dry-run:${tenantId}:${roleDefinition.code}`,
    tenantId,
    code: roleDefinition.code,
  };
}

async function findActiveRoleNameConflict(client, tenantId, roleDefinition, existingRoleId) {
  return client.tenantRole.findFirst({
    where: {
      tenantId,
      deletedAt: null,
      name: {
        equals: roleDefinition.name,
        mode: 'insensitive',
      },
      ...(existingRoleId ? { id: { not: existingRoleId } } : {}),
    },
    select: {
      id: true,
      code: true,
      name: true,
    },
  });
}

async function ensureBuiltinRole(client, tenantId, roleDefinition) {
  const existing = await client.tenantRole.findUnique({
    where: {
      tenantId_code: {
        tenantId,
        code: roleDefinition.code,
      },
    },
  });

  const nameConflict = await findActiveRoleNameConflict(client, tenantId, roleDefinition, existing?.id);
  if (nameConflict) {
    report.conflicts.push({
      tenantId,
      expectedRoleCode: roleDefinition.code,
      expectedRoleName: roleDefinition.name,
      conflictRoleId: nameConflict.id,
      conflictRoleCode: nameConflict.code,
      conflictRoleName: nameConflict.name,
      reason: '内置角色名称与当前租户已有未删除角色冲突',
    });

    if (writeEnabled) {
      throw new Error(`内置角色名称冲突：tenantId=${tenantId}, role=${roleDefinition.code}`);
    }

    return existing ?? createDryRunRole(tenantId, roleDefinition);
  }

  if (!existing) {
    if (!writeEnabled) {
      report.rolesCreated += 1;
      return createDryRunRole(tenantId, roleDefinition);
    }

    report.rolesCreated += 1;
    return client.tenantRole.create({
      data: {
        tenantId,
        code: roleDefinition.code,
        name: roleDefinition.name,
        description: roleDefinition.description,
        isSystem: true,
        isEditable: false,
        sortOrder: roleDefinition.sortOrder,
      },
    });
  }

  const shouldUpdate =
    existing.name !== roleDefinition.name ||
    existing.description !== roleDefinition.description ||
    existing.isSystem !== true ||
    existing.isEditable !== false ||
    existing.sortOrder !== roleDefinition.sortOrder ||
    existing.deletedAt !== null;

  if (!shouldUpdate) {
    return existing;
  }

  report.rolesUpdated += 1;
  if (!writeEnabled) {
    return existing;
  }

  return client.tenantRole.update({
    where: { id: existing.id },
    data: {
      name: roleDefinition.name,
      description: roleDefinition.description,
      isSystem: true,
      isEditable: false,
      sortOrder: roleDefinition.sortOrder,
      deletedAt: null,
    },
  });
}

async function ensureRolePermissions(client, role, roleDefinition) {
  if (!writeEnabled && role.id.startsWith('dry-run:')) {
    report.rolePermissionsCreated += roleDefinition.permissions.length;
    return;
  }

  const existingPermissions = await client.tenantRolePermission.findMany({
    where: { roleId: role.id },
    select: { permissionCode: true },
  });
  const existingCodes = new Set(existingPermissions.map((item) => item.permissionCode));
  const missingCodes = roleDefinition.permissions.filter((code) => !existingCodes.has(code));

  if (missingCodes.length === 0) {
    return;
  }

  report.rolePermissionsCreated += missingCodes.length;
  if (!writeEnabled) {
    return;
  }

  await client.tenantRolePermission.createMany({
    data: missingCodes.map((permissionCode) => ({
      roleId: role.id,
      permissionCode,
    })),
    skipDuplicates: true,
  });
}

async function ensureUserAssignment(client, tenantId, user, role) {
  const existing = await client.userRoleAssignment.findUnique({
    where: {
      tenantId_userId: {
        tenantId,
        userId: user.id,
      },
    },
    include: {
      role: {
        select: {
          code: true,
          name: true,
        },
      },
    },
  });

  if (existing) {
    if (existing.roleId === role.id) {
      report.usersAlreadyBound += 1;
      return;
    }

    recordConflict(user, existing, role);
    return;
  }

  report.userRoleAssignmentsCreated += 1;
  if (!writeEnabled) {
    return;
  }

  await client.userRoleAssignment.create({
    data: {
      tenantId,
      userId: user.id,
      roleId: role.id,
      isPrimary: true,
    },
  });
}

async function migrateTenant(client, tenant) {
  report.tenantsProcessed += 1;

  const roleByCode = new Map();
  for (const roleDefinition of BUILTIN_ROLES) {
    const role = await ensureBuiltinRole(client, tenant.id, roleDefinition);
    roleByCode.set(roleDefinition.code, role);
    await ensureRolePermissions(client, role, roleDefinition);
  }

  const users = await client.user.findMany({
    where: {
      tenantId: tenant.id,
      deletedAt: null,
    },
    orderBy: { createdAt: 'asc' },
  });

  const ownerCount = users.filter((user) => user.role === UserRoleEnum.TENANT_OWNER).length;
  if (ownerCount === 0) {
    report.conflicts.push({
      tenantId: tenant.id,
      reason: '租户没有任何 TENANT_OWNER 用户',
    });
  }

  for (const user of users) {
    if (!user.tenantId) {
      recordAbnormalUser(user, 'Tenant 角色用户 tenantId 为空');
      report.usersSkipped += 1;
      continue;
    }

    if (user.role === UserRoleEnum.OS_SUPER_ADMIN) {
      recordAbnormalUser(user, '租户用户角色为 OS_SUPER_ADMIN');
      report.usersSkipped += 1;
      continue;
    }

    const roleDefinition = ROLE_BY_CODE.get(user.role);
    if (!roleDefinition) {
      recordAbnormalUser(user, '无法映射到内置租户角色');
      report.usersSkipped += 1;
      continue;
    }

    const role = roleByCode.get(roleDefinition.code);
    if (!role) {
      report.conflicts.push({
        tenantId: tenant.id,
        userId: user.id,
        reason: `找不到内置角色 ${roleDefinition.code}`,
      });
      report.usersSkipped += 1;
      continue;
    }

    await ensureUserAssignment(client, tenant.id, user, role);
  }
}

async function main() {
  const targetTablesReady = await ensureTargetTablesExist();
  if (!targetTablesReady) {
    return;
  }

  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });

  writeEnabled = false;
  report = createReport('preflight');
  for (const tenant of tenants) {
    await migrateTenant(prisma, tenant);
  }

  if (report.conflicts.length > 0 || report.abnormalUsers.length > 0) {
    report.blockedReason = '预检发现冲突或异常用户，未执行写库。请先处理 report 后再使用 --apply。';
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  if (!applyRequested) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  writeEnabled = true;
  report = createReport('apply');
  try {
    await prisma.$transaction(
      async (tx) => {
        for (const tenant of tenants) {
          await migrateTenant(tx, tenant);
        }

        if (report.conflicts.length > 0 || report.abnormalUsers.length > 0) {
          report.blockedReason = '写库阶段发现冲突或异常用户，事务已回滚。';
          throw new Error(report.blockedReason);
        }
      },
      { maxWait: 30000, timeout: 300000 },
    );
  } catch (error) {
    console.log(JSON.stringify(report, null, 2));
    throw error;
  }

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
