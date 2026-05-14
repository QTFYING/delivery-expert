const bcrypt = require('bcrypt');
const { PrismaClient, TenantStatusEnum, UserRoleEnum, UserStatusEnum } = require('@prisma/client');
const { apiRequest, sleep } = require('../shared/helpers');

const FIXTURES = {
  tenantId: 'T-12345678',
  ownerId: '7f4d6bde-8e44-4f39-9c5d-4d5f8f90a002',
  financeId: '7f4d6bde-8e44-4f39-9c5d-4d5f8f90a003',
  ownerAccount: 'reg_owner_20260411',
  financeAccount: 'reg_finance_20260411',
  password: 'Passw0rd!',
  templateName: '联调饮品导入模板',
  sourceOrderNo: 'REG-IMPORT-20260411-001',
};

async function prepareFixtures(prisma) {
  const passwordHash = await bcrypt.hash(FIXTURES.password, 10);

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
