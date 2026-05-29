const bcrypt = require('bcrypt');
const { PrismaClient, TenantStatusEnum, UserRoleEnum, UserStatusEnum } = require('@prisma/client');
const { TenantPermissionCodeEnum } = require('@shou/types/enums');
const { apiRequest, sleep } = require('../shared/helpers');

const FIXTURES = {
  tenantId: 'T-12345678',
  otherTenantId: 'T-87654321',
  otherTenantRoleId: '4ce5a3d1-3e90-42be-a836-c07d90f16d31',
  ownerId: '7f4d6bde-8e44-4f39-9c5d-4d5f8f90a002',
  financeId: '7f4d6bde-8e44-4f39-9c5d-4d5f8f90a003',
  osAdminId: '7f4d6bde-8e44-4f39-9c5d-4d5f8f90a010',
  ownerAccount: 'reg_owner_20260411',
  financeAccount: 'reg_finance_20260411',
  osAdminAccount: 'reg_os_admin_20260411',
  rbacUserAccount: 'reg_rbac_user_20260411',
  rbacUserPhone: '13800000003',
  readOnlyAccount: 'reg_readonly_20260411',
  readOnlyPhone: '13800000004',
  createdTenantOwnerAccount: '13800000999',
  createdTenantOwnerPassword: 'NewPassw0rd!',
  password: 'Passw0rd!',
  templateName: '联调饮品导入模板',
  sourceOrderNo: 'REG-IMPORT-20260411-001',
};

async function prepareFixtures(prisma) {
  const passwordHash = await bcrypt.hash(FIXTURES.password, 10);
  await clearTenantPermissionCache();
  await prisma.$executeRawUnsafe('CREATE SEQUENCE IF NOT EXISTS tenant_seq START 100001');

  await prisma.orderPrintRecord.deleteMany({ where: { tenantId: FIXTURES.tenantId } });
  await prisma.orderReminder.deleteMany({ where: { tenantId: FIXTURES.tenantId } });
  await prisma.payment.deleteMany({ where: { tenantId: FIXTURES.tenantId } });
  await prisma.paymentOrder.deleteMany({ where: { tenantId: FIXTURES.tenantId } });
  await prisma.importJob.deleteMany({ where: { tenantId: FIXTURES.tenantId } });
  await prisma.printerTemplate.deleteMany({ where: { tenantId: FIXTURES.tenantId } });
  await prisma.order.deleteMany({ where: { tenantId: FIXTURES.tenantId } });
  await prisma.importTemplate.deleteMany({ where: { tenantId: FIXTURES.tenantId } });
  await prisma.auditLog.deleteMany({ where: { tenantId: FIXTURES.tenantId } });
  await prisma.tenantGeneralSettings.deleteMany({ where: { tenantId: FIXTURES.tenantId } });
  await prisma.userRoleAssignment.deleteMany({ where: { tenantId: FIXTURES.tenantId } });
  await prisma.tenantRole.deleteMany({ where: { tenantId: FIXTURES.tenantId } });
  await prisma.tenantRole.deleteMany({ where: { tenantId: FIXTURES.otherTenantId } });
  const createdTenantOwner = await prisma.user.findFirst({
    where: { account: FIXTURES.createdTenantOwnerAccount },
    select: { tenantId: true },
  });
  if (createdTenantOwner?.tenantId) {
    await prisma.userRoleAssignment.deleteMany({ where: { tenantId: createdTenantOwner.tenantId } });
    await prisma.tenantRole.deleteMany({ where: { tenantId: createdTenantOwner.tenantId } });
    await prisma.user.deleteMany({ where: { tenantId: createdTenantOwner.tenantId } });
    await prisma.tenant.deleteMany({ where: { id: createdTenantOwner.tenantId } });
  }
  await prisma.user.deleteMany({ where: { account: { in: [FIXTURES.rbacUserAccount, FIXTURES.readOnlyAccount, FIXTURES.osAdminAccount] } } });

  await prisma.user.create({
    data: {
      id: FIXTURES.osAdminId,
      tenantId: null,
      account: FIXTURES.osAdminAccount,
      passwordHash,
      realName: '联调平台管理员',
      role: UserRoleEnum.OS_SUPER_ADMIN,
      status: UserStatusEnum.ACTIVE,
      requiresPasswordReset: false,
    },
  });

  await prisma.tenant.upsert({
    where: { id: FIXTURES.otherTenantId },
    create: {
      id: FIXTURES.otherTenantId,
      name: '联调其他租户',
      contactPhone: '13900000000',
      address: '深圳市南山区隔离路 2 号',
      licenseNo: 'LIC-20260412',
      status: TenantStatusEnum.ACTIVE,
      maxCreditDays: 30,
      creditReminderDays: 3,
    },
    update: {
      name: '联调其他租户',
      contactPhone: '13900000000',
      address: '深圳市南山区隔离路 2 号',
      licenseNo: 'LIC-20260412',
      status: TenantStatusEnum.ACTIVE,
      deletedAt: null,
      maxCreditDays: 30,
      creditReminderDays: 3,
    },
  });

  await prisma.tenantRole.create({
    data: {
      id: FIXTURES.otherTenantRoleId,
      tenantId: FIXTURES.otherTenantId,
      code: 'TENANT_VIEWER',
      name: '其他租户访客',
      description: '用于跨租户 roleId 绑定回归',
      isSystem: true,
      isEditable: false,
      sortOrder: 40,
    },
  });

  await prisma.tenant.upsert({
    where: { id: FIXTURES.tenantId },
    create: {
      id: FIXTURES.tenantId,
      name: '联调回归租户',
      contactPhone: '13800000000',
      address: '深圳市南山区联调路 1 号',
      licenseNo: 'LIC-20260411',
      status: TenantStatusEnum.ACTIVE,
      maxCreditDays: 30,
      creditReminderDays: 3,
    },
    update: {
      name: '联调回归租户',
      contactPhone: '13800000000',
      address: '深圳市南山区联调路 1 号',
      licenseNo: 'LIC-20260411',
      status: TenantStatusEnum.ACTIVE,
      deletedAt: null,
      maxCreditDays: 30,
      creditReminderDays: 3,
    },
  });

  await prisma.user.upsert({
    where: { account: FIXTURES.ownerAccount },
    create: {
      id: FIXTURES.ownerId,
      tenantId: FIXTURES.tenantId,
      account: FIXTURES.ownerAccount,
      phone: '13800000001',
      passwordHash,
      realName: '联调老板',
      role: UserRoleEnum.TENANT_OWNER,
      status: UserStatusEnum.ACTIVE,
      requiresPasswordReset: false,
    },
    update: {
      id: FIXTURES.ownerId,
      tenantId: FIXTURES.tenantId,
      phone: '13800000001',
      passwordHash,
      realName: '联调老板',
      role: UserRoleEnum.TENANT_OWNER,
      status: UserStatusEnum.ACTIVE,
      deletedAt: null,
      requiresPasswordReset: false,
    },
  });

  await prisma.user.upsert({
    where: { account: FIXTURES.financeAccount },
    create: {
      id: FIXTURES.financeId,
      tenantId: FIXTURES.tenantId,
      account: FIXTURES.financeAccount,
      phone: '13800000002',
      passwordHash,
      realName: '联调财务',
      role: UserRoleEnum.TENANT_FINANCE,
      status: UserStatusEnum.ACTIVE,
      requiresPasswordReset: false,
    },
    update: {
      id: FIXTURES.financeId,
      tenantId: FIXTURES.tenantId,
      phone: '13800000002',
      passwordHash,
      realName: '联调财务',
      role: UserRoleEnum.TENANT_FINANCE,
      status: UserStatusEnum.ACTIVE,
      deletedAt: null,
      requiresPasswordReset: false,
    },
  });

  const builtinRoles = [
    {
      code: 'TENANT_OWNER',
      name: '老板',
      description: '租户管理员，拥有全部管理权限',
      sortOrder: 10,
      permissions: Object.values(TenantPermissionCodeEnum),
      userId: FIXTURES.ownerId,
    },
    {
      code: 'TENANT_FINANCE',
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
      userId: FIXTURES.financeId,
    },
    {
      code: 'TENANT_OPERATOR',
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
      code: 'TENANT_VIEWER',
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

  await prisma.user.create({
    data: {
      tenantId: FIXTURES.tenantId,
      account: FIXTURES.readOnlyAccount,
      phone: FIXTURES.readOnlyPhone,
      passwordHash,
      realName: '联调只读员工',
      role: UserRoleEnum.TENANT_VIEWER,
      status: UserStatusEnum.ACTIVE,
      requiresPasswordReset: false,
    },
  });

  let readOnlyRoleId = null;
  for (const roleDefinition of builtinRoles) {
    const role = await prisma.tenantRole.create({
      data: {
        tenantId: FIXTURES.tenantId,
        code: roleDefinition.code,
        name: roleDefinition.name,
        description: roleDefinition.description,
        isSystem: true,
        isEditable: false,
        sortOrder: roleDefinition.sortOrder,
      },
    });

    await prisma.tenantRolePermission.createMany({
      data: roleDefinition.permissions.map((permissionCode) => ({
        roleId: role.id,
        permissionCode,
      })),
    });

    if (roleDefinition.code === 'TENANT_VIEWER') {
      readOnlyRoleId = role.id;
    }

    if (roleDefinition.userId) {
      await prisma.userRoleAssignment.create({
        data: {
          tenantId: FIXTURES.tenantId,
          userId: roleDefinition.userId,
          roleId: role.id,
          isPrimary: true,
        },
      });
    }
  }

  const readOnlyUser = await prisma.user.findUniqueOrThrow({ where: { account: FIXTURES.readOnlyAccount } });
  await prisma.userRoleAssignment.create({
    data: {
      tenantId: FIXTURES.tenantId,
      userId: readOnlyUser.id,
      roleId: readOnlyRoleId,
      isPrimary: true,
    },
  });
}

async function clearTenantPermissionCache() {
  const { createClient } = require('redis');
  const client = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  await client.connect();

  try {
    for (const pattern of [`tenant-permissions:${FIXTURES.tenantId}:*`, `tenant-permission-version:${FIXTURES.tenantId}:*`]) {
      for await (const item of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        const keys = Array.isArray(item) ? item : [item];
        if (keys.length > 0) {
          await client.del(keys);
        }
      }
    }
  } finally {
    await client.quit();
  }
}

function buildImportTemplatePayload() {
  return {
    name: FIXTURES.templateName,
    isDefault: true,
    defaultFields: [
      {
        label: '源订单号',
        key: 'sourceOrderNo',
        mapStr: '源订单号',
        isRequired: true,
        isValueRequired: true,
        type: 'list',
      },
      { label: '客户名称', key: 'customer', mapStr: '客户名称', isRequired: true, isValueRequired: true, type: 'list' },
      {
        label: '客户电话',
        key: 'customerPhone',
        mapStr: '客户电话',
        isRequired: false,
        isValueRequired: false,
        type: 'list',
      },
      {
        label: '客户地址',
        key: 'customerAddress',
        mapStr: '客户地址',
        isRequired: false,
        isValueRequired: true,
        type: 'list',
      },
      { label: '总金额', key: 'totalAmount', mapStr: '总金额', isRequired: false, isValueRequired: true, type: 'list' },
      {
        label: '下单时间',
        key: 'orderTime',
        mapStr: '下单时间',
        isRequired: true,
        isValueRequired: true,
        type: 'list',
      },
      { label: '结算方式', key: 'payType', mapStr: '结算方式', isRequired: false, isValueRequired: true, type: 'list' },
      { label: '品名', key: 'skuName', mapStr: '商品名称', isRequired: false, isValueRequired: false, type: 'line' },
      { label: '规格', key: 'skuSpec', mapStr: '商品规格', isRequired: false, isValueRequired: false, type: 'line' },
      { label: '单位', key: 'unit', mapStr: '单位', isRequired: false, isValueRequired: false, type: 'line' },
      { label: '数量', key: 'quantity', mapStr: '数量', isRequired: false, isValueRequired: false, type: 'line' },
      { label: '包装规格', key: 'packSpec', mapStr: '包装规格', isRequired: false, isValueRequired: false, type: 'line' },
      { label: '单价', key: 'unitPrice', mapStr: '单价', isRequired: false, isValueRequired: false, type: 'line' },
      { label: '金额', key: 'lineAmount', mapStr: '商品金额', isRequired: false, isValueRequired: false, type: 'line' },
    ],
    customerFields: [],
  };
}

function buildImportRows() {
  return [
    {
      sourceOrderNo: FIXTURES.sourceOrderNo,
      customer: '深圳联调客户',
      customerPhone: '13800001111',
      customerAddress: '广东省深圳市南山区',
      totalAmount: 12,
      orderTime: '2026-04-11 10:00:00',
      payType: 'cash',
      customerFieldValues: {},
      lineItems: [
        {
          skuName: '农夫山泉 550ml',
          quantity: 2,
          unitPrice: 6,
          lineAmount: 12,
        },
      ],
    },
    {
      sourceOrderNo: FIXTURES.sourceOrderNo + '-2',
      customer: '深圳联调客户',
      customerPhone: '13800001111',
      customerAddress: '广东省深圳市南山区',
      totalAmount: 12,
      orderTime: '2026-04-11 10:00:00',
      payType: 'cash',
      customerFieldValues: {},
      lineItems: [
        {
          skuName: '康师傅冰红茶',
          quantity: 3,
          unitPrice: 4,
          lineAmount: 12,
        },
      ],
    },
  ];
}

async function waitImportJob(baseUrl, token, jobId, results) {
  for (let i = 0; i < 30; i += 1) {
    const response = await apiRequest(results, `Import Job Poll #${i + 1}`, {
      method: 'GET',
      url: `${baseUrl}/orders/import/jobs/${jobId}`,
      token,
    });

    if (response.data.status === 'completed' || response.data.status === 'failed') {
      return response;
    }

    await sleep(500);
  }

  throw new Error(`导入任务轮询超时: ${jobId}`);
}

module.exports = {
  FIXTURES,
  prepareFixtures,
  buildImportTemplatePayload,
  buildImportRows,
  waitImportJob,
};
