import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as crypto from 'crypto';
import { createClient, RedisClientType } from 'redis';
import { redisConfig } from '../config/redis.config';

// 分布式锁续期脚本：只有锁值仍然匹配当前持有者时，才允许刷新 TTL
const EXTEND_LOCK_IF_MATCHES_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("expire", KEYS[1], ARGV[2])
  else
    return 0
  end
`;

// 分布式锁释放脚本：只有锁值仍然匹配当前持有者时，才允许删除该锁
const DELETE_LOCK_IF_MATCHES_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

// JSON 条件更新脚本：只有 JSON 顶层字段仍等于预期值时，才更新整份 JSON 并刷新 TTL
const SET_JSON_IF_FIELD_MATCHES_SCRIPT = `
  local current = redis.call("get", KEYS[1])
  if not current then
    return 0
  end

  local ok, decoded = pcall(cjson.decode, current)
  if not ok or type(decoded) ~= "table" then
    return 0
  end

  local currentFieldValue = decoded[ARGV[1]]
  if currentFieldValue == nil or tostring(currentFieldValue) ~= ARGV[2] then
    return 0
  end

  redis.call("set", KEYS[1], ARGV[3], "EX", ARGV[4])
  return 1
`;

// JSON 条件删除脚本：只有 JSON 顶层字段仍等于预期值时，才删除整个 key
const DELETE_JSON_IF_FIELD_MATCHES_SCRIPT = `
  local current = redis.call("get", KEYS[1])
  if not current then
    return 0
  end

  local ok, decoded = pcall(cjson.decode, current)
  if not ok or type(decoded) ~= "table" then
    return 0
  end

  local currentFieldValue = decoded[ARGV[1]]
  if currentFieldValue == nil or tostring(currentFieldValue) ~= ARGV[2] then
    return 0
  end

  return redis.call("del", KEYS[1])
`;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;
  private readonly logger = new Logger(RedisService.name);

  constructor(
    @Inject(redisConfig.KEY)
    redisSettings: ConfigType<typeof redisConfig>,
  ) {
    this.client = createClient({
      url: redisSettings.url,
    });
  }

  // 模块启动时建立 Redis 连接，并挂载统一错误日志
  async onModuleInit() {
    this.client.on('error', (err) => {
      this.logger.error('Redis connection error', err);
    });
    await this.client.connect();
  }

  // 模块销毁时主动关闭 Redis 连接，避免开发态和测试态残留连接
  async onModuleDestroy() {
    await this.client.quit();
  }

  /**
   * 尝试获取分布式锁
   * 成功时返回本次锁的唯一持有者标识，后续续期与释放都要带上它；失败时返回 null
   */
  async acquireLock(key: string, ttlSeconds: number = 30): Promise<string | null> {
    const lockValue = crypto.randomUUID();
    const result = await this.client.set(key, lockValue, {
      NX: true,
      EX: ttlSeconds,
    });
    return result === 'OK' ? lockValue : null;
  }

  /**
   * 仅当调用方仍然持有该分布式锁时，才允许续期锁的 TTL
   * 典型用途：长任务执行过程中定期续命，避免锁在任务尚未结束时自然过期
   */
  async extendLock(key: string, lockValue: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.eval(EXTEND_LOCK_IF_MATCHES_SCRIPT, {
      keys: [key],
      arguments: [lockValue, ttlSeconds.toString()],
    });
    return result === 1;
  }

  /**
   * 仅当调用方仍然持有该分布式锁时，才允许释放锁
   * 使用 Lua 原子比较并删除，避免旧任务误删新任务刚拿到的锁
   */
  async releaseLock(key: string, lockValue: string): Promise<boolean> {
    const result = await this.client.eval(DELETE_LOCK_IF_MATCHES_SCRIPT, {
      keys: [key],
      arguments: [lockValue],
    });
    return result === 1;
  }

  // 直接写入 JSON 值，并覆盖该 key 的 TTL
  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  }

  // 仅当 key 不存在时写入 JSON 值，常用于“占位”或“单次消费”语义
  async setJsonIfAbsent(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, JSON.stringify(value), {
      NX: true,
      EX: ttlSeconds,
    });
    return result === 'OK';
  }

  // 仅当 key 不存在时写入短 TTL 字符串值，适合请求级毫秒窗口频控
  async setIfAbsentForMilliseconds(key: string, value: string, ttlMilliseconds: number): Promise<boolean> {
    const result = await this.client.set(key, value, {
      NX: true,
      PX: ttlMilliseconds,
    });
    return result === 'OK';
  }

  // 仅当当前 JSON 顶层字段仍匹配预期值时，才原子更新整份 JSON 并刷新 TTL
  // 典型用途：只有活动任务 key 里的 jobId 还是自己时，才允许续期和改状态
  async setJsonIfFieldMatches(key: string, fieldName: string, expectedFieldValue: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.eval(SET_JSON_IF_FIELD_MATCHES_SCRIPT, {
      keys: [key],
      arguments: [fieldName, expectedFieldValue, JSON.stringify(value), ttlSeconds.toString()],
    });
    return result === 1;
  }

  // 读取 JSON key，并反序列化为调用方指定的类型
  async getJson<T>(key: string): Promise<T | null> {
    const result = await this.client.get(key);
    if (!result) {
      return null;
    }

    return JSON.parse(result) as T;
  }

  // 直接删除指定 key，不做持有者或字段匹配校验
  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  // 仅当当前 JSON 顶层字段仍匹配预期值时，才原子删除该 key
  // 典型用途：只有活动任务 key 里的 jobId 还是自己时，旧任务才有资格清理占位
  async deleteJsonIfFieldMatches(key: string, fieldName: string, expectedFieldValue: string): Promise<boolean> {
    const result = await this.client.eval(DELETE_JSON_IF_FIELD_MATCHES_SCRIPT, {
      keys: [key],
      arguments: [fieldName, expectedFieldValue],
    });
    return result === 1;
  }

  // 暴露底层 Redis client，供 AuthSessionStore 这类需要 hash / zset / multi 的基础设施复用
  // 约束：业务模块不要直接拿 client 拼业务逻辑，优先复用本 service 已封装的原语
  getClient(): RedisClientType {
    return this.client;
  }
}
