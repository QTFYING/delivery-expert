/**
 * Tenant 权限一致性巡检脚本
 *
 * 用途：
 *   对指定 (tenantId, userId)，打印三段视图并做差集对比：
 *     1. 代码默认权限集（DEFAULT_TENANT_ROLE_PERMISSIONS）
 *     2. 数据库实际权限（user_role_assignments → tenant_roles → tenant_role_permissions）
 *     3. Redis 权限快照（tenant-permissions:{tenantId}:{userId}）
 *   适合排查「为什么用户看到 403 / 为什么改了 DB 还是没生效」类问题。
 *
 * 用法：
 *   node scripts/permission-diagnose.js --tenant=T100001 --user=ed876c8c-...
 *   node scripts/permission-diagnose.js T100001 ed876c8c-...
 *
 * 退出码：
 *   0  → DB 与代码默认值一致，且（OWNER 走写死路径或 Redis 与 DB 一致）
 *   1  → 发现任意一种不一致或环境异常
 *
 * 注意：
 *   - 本脚本只读，不修改 DB / Redis
 *   - OWNER 角色运行时由 permission.service.ts:152 写死全权限，
 *     与 DB 实际记录无关，脚本会单独标注
 */

const path = require('node:path');
const { createRequire } = require('node:module');

let apiRequire;
try {
  // Monorepo 开发环境：复用 apps/api 的 node_modules
  apiRequire = createRequire(path.join(__dirname, '../apps/api/package.json'));
} catch (e) {
  // Docker 生产环境：根目录已铺平 node_modules
  apiRequire = require;
}

const { PrismaClient } = apiRequire('@prisma/client');
const redisLib = apiRequire('redis');

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// 代码默认权限集
//   与 apps/api/src/authorization/tenant-permission.definition.ts 保持一一对应
//   若那边新增权限项，请同步更新本表，或将本表抽到 packages 复用
// ---------------------------------------------------------------------------

const TENANT_OWNER_PERMISSIONS = [
  'analytics.read',
  'orders.read',
  'orders.manage',
  'orders.import.manage',
  'orders.print.manage',
  'orders.reminder.create',
  'templates.read',
  'templates.manage',
  'credit.receipt.create',
  'payments.read',
  'payments.offline_payment_verify.create',
  'finance.read',
  'finance.export',
  'printing.config.read',
  'printing.config.update',
  'settings.general.manage',
  'settings.users.manage',
  'settings.roles.manage',
  'settings.audit_logs.read',
  'settings.payment_configs.read',
  'settings.payment_configs.manage',
  'tenant.profile.read',
  'tenant.certification.manage',
  'notifications.read',
  'notifications.manage',
];

const DEFAULT_TENANT_ROLE_PERMISSIONS = {
  TENANT_OWNER: TENANT_OWNER_PERMISSIONS,
  TENANT_FINANCE: [
    'analytics.read',
    'orders.read',
    'orders.reminder.create',
    'templates.read',
    'credit.receipt.create',
    'payments.read',
    'payments.offline_payment_verify.create',
    'finance.read',
    'finance.export',
    'settings.payment_configs.read',
    'tenant.profile.read',
    'notifications.read',
    'notifications.manage',
  ],
  TENANT_OPERATOR: [
    'orders.read',
    'orders.manage',
    'orders.import.manage',
    'orders.print.manage',
    'templates.read',
    'printing.config.read',
    'tenant.profile.read',
    'notifications.read',
    'notifications.manage',
  ],
  TENANT_VIEWER: ['analytics.read', 'orders.read', 'templates.read', 'tenant.profile.read', 'notifications.read'],
};

// Redis key 规则，与 permission-cache.service.ts:136-143 完全一致
function getSnapshotKey(tenantId, userId) {
  return `tenant-permissions:${tenantId}:${userId}`;
}

function getVersionKey(tenantId, userId) {
  return `tenant-permission-version:${tenantId}:${userId}`;
}

function parseArgs(argv) {
  const args = { tenantId: undefined, userId: undefined };
  const positional = [];
  for (const raw of argv.slice(2)) {
    // 兼容 pnpm/npm 透传的裸 `--` 分隔符，不参与位置解析
    if (raw === '--') continue;
    if (raw.startsWith('--tenant=')) args.tenantId = raw.slice('--tenant='.length).trim();
    else if (raw.startsWith('--user=')) args.userId = raw.slice('--user='.length).trim();
    else if (raw === '--help' || raw === '-h') args.help = true;
    else positional.push(raw);
  }
  if (!args.tenantId && positional[0]) args.tenantId = positional[0];
  if (!args.userId && positional[1]) args.userId = positional[1];
  return args;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function printUsage() {
  console.log(`用法：
  node scripts/permission-diagnose.js --tenant=<tenantId> --user=<userId>
  node scripts/permission-diagnose.js <tenantId> <userId>

示例：
  node scripts/permission-diagnose.js T100001 ed876c8c-b354-4608-9400-c008befb8f22
`);
}

function diffSet(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item)).sort();
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

async function loadDbView(tenantId, userId) {
  const assignment = await prisma.userRoleAssignment.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    include: {
      role: { include: { permissions: true } },
    },
  });

  if (!assignment) {
    return { found: false };
  }

  const role = assignment.role;
  return {
    found: true,
    roleId: role.id,
    roleCode: role.code,
    roleName: role.name,
    isSystem: role.isSystem,
    deletedAt: role.deletedAt,
    permissions: sortedUnique(role.permissions.map((p) => p.permissionCode)),
  };
}

async function loadRedisView(redisUrl, tenantId, userId) {
  const client = redisLib.createClient({ url: redisUrl });
  client.on('error', (err) => {
    // 仅在最终诊断时统一抛出，连接级错误降级为软失败
    console.error('[redis] 连接错误：', err.message);
  });

  await client.connect();
  try {
    const [snapshotRaw, versionRaw] = await Promise.all([client.get(getSnapshotKey(tenantId, userId)), client.get(getVersionKey(tenantId, userId))]);

    let snapshot = null;
    if (snapshotRaw) {
      try {
        snapshot = JSON.parse(snapshotRaw);
      } catch (err) {
        snapshot = { __parseError: err.message, raw: snapshotRaw };
      }
    }

    const version = versionRaw ? Number.parseInt(versionRaw, 10) : null;
    return { snapshot, version };
  } finally {
    await client.quit();
  }
}

function formatList(values) {
  if (!values || values.length === 0) return '(空)';
  return values.map((v) => `  - ${v}`).join('\n');
}

function printSection(title) {
  console.log('\n' + '='.repeat(72));
  console.log(title);
  console.log('='.repeat(72));
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.tenantId || !args.userId) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  const tenantId = args.tenantId;
  const userId = args.userId;

  if (!isUuid(userId)) {
    console.error(`[失败] userId 不是合法 UUID：${userId}`);
    console.error('       本仓库 user_role_assignments.userId 字段为 uuid 类型');
    process.exit(1);
  }

  console.log(`目标：tenantId=${tenantId} userId=${userId}`);

  const dbView = await loadDbView(tenantId, userId);
  if (!dbView.found) {
    console.error('\n[失败] 在 user_role_assignments 中未找到该用户在该租户下的角色绑定');
    console.error('       请确认 tenantId/userId 是否正确、是否未被软删');
    process.exit(1);
  }

  printSection('1) 数据库实际视图');
  console.log(`role_id   : ${dbView.roleId}`);
  console.log(`role_code : ${dbView.roleCode}`);
  console.log(`role_name : ${dbView.roleName}`);
  console.log(`isSystem  : ${dbView.isSystem}`);
  console.log(`deletedAt : ${dbView.deletedAt ?? 'null'}`);
  console.log(`权限数    : ${dbView.permissions.length}`);
  console.log('权限明细  :');
  console.log(formatList(dbView.permissions));

  const expectedFromCode = DEFAULT_TENANT_ROLE_PERMISSIONS[dbView.roleCode] ?? null;
  const isBuiltinRole = expectedFromCode !== null;

  printSection('2) 代码默认权限集（仅内置角色有意义）');
  if (!isBuiltinRole) {
    console.log(`role_code=${dbView.roleCode} 是自定义角色（CUSTOM_*），无代码默认值，跳过对比`);
  } else {
    const expected = sortedUnique(expectedFromCode);
    console.log(`期望权限数 : ${expected.length}`);
    console.log('期望权限明细 :');
    console.log(formatList(expected));

    const missingInDb = diffSet(expected, dbView.permissions);
    const extraInDb = diffSet(dbView.permissions, expected);

    printSection('3) 默认值 ↔ 数据库 差集');
    console.log(`DB 缺少（需要回灌）：${missingInDb.length}`);
    console.log(formatList(missingInDb));
    console.log(`DB 多出（自定义授权或脏数据）：${extraInDb.length}`);
    console.log(formatList(extraInDb));
  }

  // ---------------------------------------------------------------------------
  // Redis 视图
  // ---------------------------------------------------------------------------

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    printSection('4) Redis 视图');
    console.log('未设置 REDIS_URL 环境变量，跳过 Redis 比对');
    console.log('提示：可通过 export REDIS_URL=redis://:password@host:6379 后重新执行');
    process.exit(0);
  }

  let redisView;
  try {
    redisView = await loadRedisView(redisUrl, tenantId, userId);
  } catch (err) {
    printSection('4) Redis 视图');
    console.error('[失败] 读取 Redis 异常：', err.message);
    process.exit(1);
  }

  printSection('4) Redis 视图');
  console.log(`快照 key   : ${getSnapshotKey(tenantId, userId)}`);
  console.log(`版本 key   : ${getVersionKey(tenantId, userId)}`);
  console.log(`快照存在   : ${redisView.snapshot ? '是' : '否'}`);
  console.log(`Redis 版本 : ${redisView.version ?? '(未初始化)'}`);

  if (!redisView.snapshot) {
    console.log('\n说明：快照缺失属正常状态（懒加载），下次该用户请求时会从 DB 重建。');
    console.log('如果是手动改过 DB 想确认能立刻生效，建议保持快照缺失即可。');
    process.exit(0);
  }

  if (redisView.snapshot.__parseError) {
    console.error('\n[失败] Redis 快照 JSON 解析失败：', redisView.snapshot.__parseError);
    console.error('原始内容：', redisView.snapshot.raw);
    process.exit(1);
  }

  const redisPermissions = sortedUnique(redisView.snapshot.permissions ?? []);
  console.log(`role_id    : ${redisView.snapshot.roleId}`);
  console.log(`role_code  : ${redisView.snapshot.roleCode}`);
  console.log(`权限数     : ${redisPermissions.length}`);
  console.log('权限明细   :');
  console.log(formatList(redisPermissions));

  printSection('5) 数据库 ↔ Redis 差集');
  if (dbView.roleCode === 'TENANT_OWNER') {
    console.log('注意：TENANT_OWNER 在 permission.service.ts:152 走写死全权限，');
    console.log('运行时返回 ALL_TENANT_PERMISSION_CODES，与本表 DB / Redis 记录无关，');
    console.log('因此即使下面差集不为空，也不影响实际授权决策。');
  }

  const missingInRedis = diffSet(dbView.permissions, redisPermissions);
  const extraInRedis = diffSet(redisPermissions, dbView.permissions);
  console.log(`Redis 缺少（需要清快照让其重建）：${missingInRedis.length}`);
  console.log(formatList(missingInRedis));
  console.log(`Redis 多出（脏数据，建议直接 DEL 快照）：${extraInRedis.length}`);
  console.log(formatList(extraInRedis));

  if (dbView.roleCode !== redisView.snapshot.roleCode || dbView.roleId !== redisView.snapshot.roleId) {
    console.log('\n[警告] DB 与 Redis 中的角色绑定不一致：');
    console.log(`  DB    roleId=${dbView.roleId} roleCode=${dbView.roleCode}`);
    console.log(`  Redis roleId=${redisView.snapshot.roleId} roleCode=${redisView.snapshot.roleCode}`);
    console.log('多半是改过角色绑定但未清快照，建议执行：');
    console.log(`  DEL ${getSnapshotKey(tenantId, userId)}`);
    console.log(`  INCR ${getVersionKey(tenantId, userId)}`);
  }

  const dbVsCodeOk =
    !isBuiltinRole ||
    (diffSet(expectedFromCode, dbView.permissions).length === 0 && diffSet(dbView.permissions, expectedFromCode).length === 0) ||
    dbView.roleCode === 'TENANT_OWNER';
  const dbVsRedisOk = dbView.roleCode === 'TENANT_OWNER' || (missingInRedis.length === 0 && extraInRedis.length === 0);

  printSection('结论');
  console.log(`DB 与代码默认值一致 : ${dbVsCodeOk ? '是' : '否'}`);
  console.log(`Redis 与 DB 一致    : ${dbVsRedisOk ? '是' : '否'}`);
  process.exit(dbVsCodeOk && dbVsRedisOk ? 0 : 1);
}

main()
  .catch((err) => {
    console.error('\n[未捕获异常]', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
