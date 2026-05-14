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

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function parseOptionalInt(name, defaultValue) {
  const raw = process.env[name];
  if (!raw || !raw.trim()) return defaultValue;

  const value = Number.parseInt(raw.trim(), 10);
  if (Number.isNaN(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

async function ensureIdSequences() {
  // 业务编号依赖的 PostgreSQL sequence，Prisma schema 无法声明，故在此幂等创建
  await prisma.$executeRawUnsafe('CREATE SEQUENCE IF NOT EXISTS tenant_seq START 100001');
  await prisma.$executeRawUnsafe('CREATE SEQUENCE IF NOT EXISTS notice_seq START 1');
  await prisma.$executeRawUnsafe('CREATE SEQUENCE IF NOT EXISTS cert_seq START 1');
  console.log('[ok] ID sequences 已就绪 (tenant_seq / notice_seq / cert_seq)');
}

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

async function ensureOsAdmin() {
  const username = requireEnv('INIT_OS_ADMIN_USERNAME');
  const password = requireEnv('INIT_OS_ADMIN_PASSWORD');
  const realName = (process.env.INIT_OS_ADMIN_REAL_NAME || '系统管理员').trim();

  const existing = await prisma.user.findFirst({
    where: {
      tenantId: null,
      account: username,
      role: UserRoleEnum.OS_SUPER_ADMIN,
      deletedAt: null,
    },
  });

  if (existing) {
    console.log(`[skip] OS 管理员已存在: ${username}`);
    return existing;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.create({
    data: {
      account: username,
      passwordHash,
      realName,
      role: UserRoleEnum.OS_SUPER_ADMIN,
      status: UserStatusEnum.ACTIVE,
    },
  });

  console.log(`[ok] 已创建 OS 管理员: ${username}`);
  return admin;
}

function hasTenantBootstrapConfig() {
  return ['INIT_TENANT_NAME', 'INIT_TENANT_CONTACT_PHONE', 'INIT_TENANT_OWNER_USERNAME', 'INIT_TENANT_OWNER_PASSWORD'].some((name) => {
    const value = process.env[name];
    return Boolean(value && value.trim());
  });
}

function validateTenantBootstrapConfig() {
  const required = ['INIT_TENANT_NAME', 'INIT_TENANT_CONTACT_PHONE', 'INIT_TENANT_OWNER_USERNAME', 'INIT_TENANT_OWNER_PASSWORD'];

  const missing = required.filter((name) => {
    const value = process.env[name];
    return !value || !value.trim();
  });

  if (missing.length > 0) {
    throw new Error(`Tenant bootstrap requires all of these variables: ${required.join(', ')}`);
  }
}

async function ensureTenantAndOwner() {
  if (!hasTenantBootstrapConfig()) {
    console.log('[skip] 未提供租户初始化参数，跳过租户与租户管理员创建');
    return;
  }

  validateTenantBootstrapConfig();

  const tenantName = requireEnv('INIT_TENANT_NAME');
  const tenantContactPhone = requireEnv('INIT_TENANT_CONTACT_PHONE');
  const ownerUsername = requireEnv('INIT_TENANT_OWNER_USERNAME');
  const ownerPassword = requireEnv('INIT_TENANT_OWNER_PASSWORD');
  const ownerRealName = (process.env.INIT_TENANT_OWNER_REAL_NAME || '租户管理员').trim();
  const maxCreditDays = parseOptionalInt('INIT_TENANT_MAX_CREDIT_DAYS', 30);
  const creditReminderDays = parseOptionalInt('INIT_TENANT_CREDIT_REMINDER_DAYS', 3);

  let tenant = await prisma.tenant.findFirst({
    where: {
      name: tenantName,
      deletedAt: null,
    },
  });

  if (!tenant) {
    const [{ nextval }] = await prisma.$queryRawUnsafe("SELECT nextval('tenant_seq') AS nextval");
    const tenantId = `T${String(nextval).padStart(6, '0')}`;
    tenant = await prisma.tenant.create({
      data: {
        id: tenantId,
        name: tenantName,
        contactPhone: tenantContactPhone,
        maxCreditDays,
        creditReminderDays,
        status: TenantStatusEnum.ACTIVE,
      },
    });
    console.log(`[ok] 已创建租户: ${tenantName}`);
  } else {
    console.log(`[skip] 租户已存在: ${tenantName}`);
  }

  const existingOwner = await prisma.user.findFirst({
    where: {
      tenantId: tenant.id,
      account: ownerUsername,
      role: UserRoleEnum.TENANT_OWNER,
      deletedAt: null,
    },
  });

  if (existingOwner) {
    console.log(`[skip] 租户管理员已存在: ${ownerUsername}`);
    return;
  }

  const passwordHash = await bcrypt.hash(ownerPassword, 12);
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      account: ownerUsername,
      passwordHash,
      realName: ownerRealName,
      role: UserRoleEnum.TENANT_OWNER,
      status: UserStatusEnum.ACTIVE,
    },
  });

  console.log(`[ok] 已创建租户管理员: ${ownerUsername}`);
}

async function main() {
  console.log('开始执行生产初始化...');
  await ensureIdSequences();
  await ensureGeneralSettingsDefaults();
  await ensureOsAdmin();
  await ensureTenantAndOwner();
  console.log('生产初始化完成');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
