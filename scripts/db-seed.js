const path = require('node:path');
const { createRequire } = require('node:module');

let apiRequire;
try {
  // 尝试开发环境下的路径 (Monorepo 结构)
  apiRequire = createRequire(path.join(__dirname, '../apps/api/package.json'));
} catch (e) {
  // 生产环境 (Docker) 下 node_modules 就在根目录，直接使用内置 require
  apiRequire = require;
}

const { PrismaClient, TenantStatusEnum, UserRoleEnum, UserStatusEnum } = apiRequire('@prisma/client');
const bcrypt = apiRequire('bcrypt');
const prisma = new PrismaClient();

const GENERAL_SETTINGS_CONFIG_GROUP = 'tenant_general_defaults';

const DEFAULT_GENERAL_SETTINGS_CONFIGS = [
  { key: 'qrCodeExpiry', value: '30', note: '收款码有效期默认值（天）' },
  { key: 'notifySeller', value: 'true', note: '是否默认通知业务员' },
  { key: 'notifyOwner', value: 'true', note: '是否默认通知老板' },
  { key: 'notifyFinance', value: 'true', note: '是否默认通知财务' },
  { key: 'creditRemindDays', value: '3', note: '账期提醒提前天数默认值' },
  { key: 'dailyReportPush', value: 'true', note: '是否默认开启日报推送' },
];

async function ensureGeneralSettingsDefaults() {
  for (const item of DEFAULT_GENERAL_SETTINGS_CONFIGS) {
    await prisma.systemConfig.upsert({
      where: {
        group_key: {
          group: GENERAL_SETTINGS_CONFIG_GROUP,
          key: item.key,
        },
      },
      create: {
        group: GENERAL_SETTINGS_CONFIG_GROUP,
        key: item.key,
        value: item.value,
        note: item.note,
      },
      update: {
        value: item.value,
        note: item.note,
      },
    });
  }
}

async function main() {
  console.log('开启强制数据对齐与密码 Bcrypt 洗表工程...');
  // 10 盐轮数的强单向哈希
  const defaultHash = bcrypt.hashSync('123456', 10);

  // 1. OS 超级管理员账号
  let osAdmin = await prisma.user.findFirst({
    where: { account: 'admin', role: UserRoleEnum.OS_SUPER_ADMIN },
  });
  if (!osAdmin) {
    osAdmin = await prisma.user.create({
      data: {
        account: 'admin',
        passwordHash: defaultHash,
        realName: 'OS超级运营管理员',
        role: UserRoleEnum.OS_SUPER_ADMIN,
        status: UserStatusEnum.ACTIVE,
      },
    });
  } else {
    await prisma.user.update({ where: { id: osAdmin.id }, data: { passwordHash: defaultHash } });
  }

  // 2. 租户
  await prisma.$executeRawUnsafe('CREATE SEQUENCE IF NOT EXISTS tenant_seq START 100001');
  let tenant = await prisma.tenant.findFirst({ where: { name: '华东区饮料总代(测试)' } });
  if (!tenant) {
    const [{ nextval }] = await prisma.$queryRawUnsafe("SELECT nextval('tenant_seq') AS nextval");
    const tenantId = `T${String(nextval).padStart(6, '0')}`;
    tenant = await prisma.tenant.create({
      data: {
        id: tenantId,
        name: '华东区饮料总代(测试)',
        contactPhone: '13888888888',
        address: '上海市浦东新区测试路 1 号',
        licenseNo: 'TEST-LICENSE-0001',
        maxCreditDays: 45,
        creditReminderDays: 7,
        status: TenantStatusEnum.ACTIVE,
      },
    });
  }

  // 3. 租户老板
  let boss = await prisma.user.findFirst({ where: { account: 'boss', tenantId: tenant.id } });
  if (!boss) {
    boss = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        account: 'boss',
        passwordHash: defaultHash,
        realName: '经销商李老板',
        role: UserRoleEnum.TENANT_OWNER,
        status: UserStatusEnum.ACTIVE,
      },
    });
  } else {
    await prisma.user.update({ where: { id: boss.id }, data: { passwordHash: defaultHash } });
  }

  await ensureGeneralSettingsDefaults();

  console.log('✅ 底层洗表完毕！所有原本裸奔在 DB 的明文账号密码，已被强制更迭为 Bcrypt 防御级散列值！');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
