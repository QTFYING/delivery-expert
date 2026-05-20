// 校验布尔环境变量 只允许显式使用 true / false 字符串
function parseBoolean(name: string, value: string): void {
  if (value !== 'true' && value !== 'false') {
    throw new Error(`${name} 必须为 true 或 false`);
  }
}

// 校验整数字符串 供端口 TTL 间隔等数值型环境变量复用
function parseInteger(name: string, value: string): void {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} 必须为整数`);
  }
}

// 校验正整数环境变量 确保导入任务 TTL / 续期间隔这类值不能为 0 或负数
function parsePositiveInteger(name: string, value: string): number {
  parseInteger(name, value);
  const parsed = Number.parseInt(value, 10);
  if (parsed <= 0) {
    throw new Error(`${name} 必须大于 0`);
  }

  return parsed;
}

// 判断环境变量是否为非空字符串 用于识别是否启用了拉卡拉配置
function hasValue(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// 统一校验并补齐后端启动所需的环境变量默认值
// 这里既负责类型检查 也承载每个环境变量的业务语义约束
export function validateEnv(rawEnv: Record<string, unknown>): Record<string, unknown> {
  const env = { ...rawEnv };

  // PostgreSQL 连接串 用于 Prisma 与业务数据读写
  if (!env.DATABASE_URL || typeof env.DATABASE_URL !== 'string') {
    throw new Error('DATABASE_URL 环境变量必填');
  }

  // JWT 签名密钥 用于登录态 access token / refresh token 签发
  if (!env.JWT_SECRET || typeof env.JWT_SECRET !== 'string') {
    throw new Error('JWT_SECRET 环境变量必填');
  }

  // Redis 连接串 用于会话 导入预检快照 分布式锁等运行期状态
  if (!env.REDIS_URL || typeof env.REDIS_URL !== 'string') {
    throw new Error('REDIS_URL 环境变量必填');
  }

  // 允许跨域的前端来源白名单 多个地址用英文逗号分隔
  if (!env.CORS_ORIGINS || typeof env.CORS_ORIGINS !== 'string') {
    throw new Error('CORS_ORIGINS 环境变量必填');
  }

  // 运行环境标识 未显式提供时默认按 development 启动
  if (!env.NODE_ENV || typeof env.NODE_ENV !== 'string') {
    env.NODE_ENV = 'development';
  }

  // API / Worker 运行环境统一使用 UTC，避免多节点部署时产生本机时区差异
  if (!env.TZ || typeof env.TZ !== 'string') {
    env.TZ = 'UTC';
  }
  if (env.TZ !== 'UTC') {
    throw new Error('TZ 必须为 UTC');
  }
  process.env.TZ = env.TZ;

  // API 监听端口 默认 3000
  if (!env.PORT || typeof env.PORT !== 'string') {
    env.PORT = '3000';
  }
  parseInteger('PORT', env.PORT as string);

  // 是否要求认证 Cookie 仅在 HTTPS 下发送 本地开发默认 false
  if (!env.AUTH_COOKIE_SECURE || typeof env.AUTH_COOKIE_SECURE !== 'string') {
    env.AUTH_COOKIE_SECURE = 'false';
  }
  parseBoolean('AUTH_COOKIE_SECURE', env.AUTH_COOKIE_SECURE as string);

  // 是否启用导入 Worker 轮询 API 进程通常为 false 独立 Worker 进程为 true
  if (!env.IMPORT_JOB_WORKER_ENABLED || typeof env.IMPORT_JOB_WORKER_ENABLED !== 'string') {
    env.IMPORT_JOB_WORKER_ENABLED = 'false';
  }
  parseBoolean('IMPORT_JOB_WORKER_ENABLED', env.IMPORT_JOB_WORKER_ENABLED as string);

  // 租户级活动正式导入任务占位 TTL 控制假占位最晚多久可以自动恢复
  if (!env.IMPORT_ACTIVE_JOB_TENANT_TTL_SECONDS || typeof env.IMPORT_ACTIVE_JOB_TENANT_TTL_SECONDS !== 'string') {
    env.IMPORT_ACTIVE_JOB_TENANT_TTL_SECONDS = '900';
  }
  const importActiveJobTenantTtlSeconds = parsePositiveInteger(
    'IMPORT_ACTIVE_JOB_TENANT_TTL_SECONDS',
    env.IMPORT_ACTIVE_JOB_TENANT_TTL_SECONDS as string,
  );

  // 租户级活动正式导入任务续期间隔 控制运行中任务多久刷新一次占位
  if (!env.IMPORT_ACTIVE_JOB_TENANT_RENEW_INTERVAL_SECONDS || typeof env.IMPORT_ACTIVE_JOB_TENANT_RENEW_INTERVAL_SECONDS !== 'string') {
    env.IMPORT_ACTIVE_JOB_TENANT_RENEW_INTERVAL_SECONDS = '60';
  }
  const importActiveJobTenantRenewIntervalSeconds = parsePositiveInteger(
    'IMPORT_ACTIVE_JOB_TENANT_RENEW_INTERVAL_SECONDS',
    env.IMPORT_ACTIVE_JOB_TENANT_RENEW_INTERVAL_SECONDS as string,
  );

  // 续期间隔必须小于 TTL 否则锁可能来不及续命就先自然过期
  if (importActiveJobTenantRenewIntervalSeconds >= importActiveJobTenantTtlSeconds) {
    throw new Error('IMPORT_ACTIVE_JOB_TENANT_RENEW_INTERVAL_SECONDS 必须小于 IMPORT_ACTIVE_JOB_TENANT_TTL_SECONDS');
  }

  // 只要用户填写了任意一项拉卡拉联调配置 就要求整组关键配置齐全
  const lakalaRequiredKeys = ['LAKALA_APP_ID', 'LAKALA_SERIAL_NO', 'LAKALA_PRIVATE_KEY', 'LAKALA_PLATFORM_PUBLIC_KEY', 'LAKALA_NOTIFY_URL'] as const;

  const hasLakalaConfig = lakalaRequiredKeys.some((key) => hasValue(env[key])) || hasValue(env.LAKALA_BASE_URL);

  // 拉卡拉联调模式下 平台级应用参数 公私钥 回调地址必须完整可用
  if (hasLakalaConfig) {
    for (const key of lakalaRequiredKeys) {
      if (!hasValue(env[key])) {
        throw new Error(`${key} 环境变量必填`);
      }
    }
  }

  return env;
}
