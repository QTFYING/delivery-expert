import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as crypto from 'crypto';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
import { authConfig } from '../config/auth.config';
import { smsConfig } from '../config/sms.config';
import { BusinessException } from '../common/exceptions/business.exception';
import { RedisService } from '../redis/redis.service';
import type {
  ClearSmsCodeInput,
  ConsumeSmsCodeInput,
  ConsumeSmsCodeResult,
  DebugSmsCodeLookupInput,
  DebugSmsCodeLookupResult,
  IssueSmsCodeInput,
  IssueSmsCodeResult,
} from './sms.types';

const SMS_CODE_TTL_SECONDS = 300;
const SMS_CODE_VALID_MINUTES = 5;
const SMS_CODE_LENGTH = 6;
const SMS_RESEND_COOLDOWN_SECONDS = 60;
const SMS_PHONE_DAILY_LIMIT = 10;
const SMS_IP_MINUTE_LIMIT = 5;
const SMS_IP_HOUR_LIMIT = 30;
const SMS_GLOBAL_MINUTE_LIMIT = 100;
const SMS_MAX_VERIFY_ATTEMPTS = 5;

const INCR_WITH_TTL_SCRIPT = `
  local current = redis.call("incr", KEYS[1])
  if current == 1 then
    redis.call("expire", KEYS[1], ARGV[1])
  end
  return current
`;

const CONSUME_CODE_SCRIPT = `
  local currentHash = redis.call("hget", KEYS[1], "codeHash")
  if not currentHash then
    return "missing"
  end

  if currentHash == ARGV[1] then
    redis.call("del", KEYS[1])
    redis.call("del", KEYS[2])
    return "ok"
  end

  local attempts = redis.call("hincrby", KEYS[1], "attempts", 1)
  if attempts >= tonumber(ARGV[2]) then
    redis.call("del", KEYS[1])
    redis.call("del", KEYS[2])
    return "locked"
  end

  return "mismatch:" .. attempts
`;

@Injectable()
export class SmsCodeStore {
  constructor(
    private readonly redis: RedisService,
    @Inject(authConfig.KEY)
    private readonly authSettings: ConfigType<typeof authConfig>,
    @Inject(smsConfig.KEY)
    private readonly smsSettings: ConfigType<typeof smsConfig>,
  ) {}

  /** 生成短信验证码并写入 Redis HMAC 记录，同时执行手机号、IP 与全局频控 */
  async issueCode(input: IssueSmsCodeInput): Promise<IssueSmsCodeResult> {
    await this.assertRateLimits(input);

    const code = this.generateCode();
    const now = dayjs().valueOf();
    const codeKey = this.getCodeKey(input.scene, input.phone);
    const debugKey = this.getDebugCodeKey(input.scene, input.phone);
    const multi = this.redis.getClient().multi();

    multi
      .hSet(codeKey, {
        codeHash: this.hashCode(input.scene, input.phone, code),
        scene: input.scene,
        phone: input.phone,
        attempts: '0',
        createdAt: String(now),
      })
      .expire(codeKey, SMS_CODE_TTL_SECONDS)
      .del(debugKey);

    if (this.smsSettings.debugCodeVisible) {
      multi.set(debugKey, code, { EX: SMS_CODE_TTL_SECONDS });
    }

    await multi.exec();

    return {
      code,
      validMinutes: SMS_CODE_VALID_MINUTES,
      expiresInSeconds: SMS_CODE_TTL_SECONDS,
    };
  }

  /** 原子校验并消费验证码，成功后一次性删除，错误次数超限后删除主记录和 debug 记录 */
  async consumeCode(input: ConsumeSmsCodeInput): Promise<ConsumeSmsCodeResult> {
    const result = await this.redis.getClient().eval(CONSUME_CODE_SCRIPT, {
      keys: [this.getCodeKey(input.scene, input.phone), this.getDebugCodeKey(input.scene, input.phone)],
      arguments: [this.hashCode(input.scene, input.phone, input.code), String(SMS_MAX_VERIFY_ATTEMPTS)],
    });

    if (result === 'ok') {
      return { consumed: true };
    }
    if (result === 'locked') {
      return { consumed: false, reason: 'too_many_attempts', remainingAttempts: 0 };
    }
    if (typeof result === 'string' && result.startsWith('mismatch:')) {
      const attempts = Number.parseInt(result.slice('mismatch:'.length), 10);
      return {
        consumed: false,
        reason: 'mismatch',
        remainingAttempts: Math.max(SMS_MAX_VERIFY_ATTEMPTS - attempts, 0),
      };
    }

    return { consumed: false, reason: 'not_found', remainingAttempts: 0 };
  }

  /** 查询调试明文验证码；开关关闭或验证码不存在时返回 null */
  async getDebugCode(input: DebugSmsCodeLookupInput): Promise<DebugSmsCodeLookupResult | null> {
    if (!this.smsSettings.debugCodeVisible) {
      return null;
    }

    const key = this.getDebugCodeKey(input.scene, input.phone);
    const [code, ttl] = await Promise.all([this.redis.getClient().get(key), this.redis.getClient().ttl(key)]);
    if (!code || ttl <= 0) {
      return null;
    }

    return { code, expiresInSeconds: ttl };
  }

  /** 删除验证码主记录和 debug 明文记录，发送失败时可同步释放冷却 key */
  async clearCode(input: ClearSmsCodeInput): Promise<void> {
    const keys = [this.getCodeKey(input.scene, input.phone), this.getDebugCodeKey(input.scene, input.phone)];
    if (input.clearCooldown) {
      keys.push(this.getCooldownKey(input.scene, input.phone));
    }
    await this.redis.getClient().del(keys);
  }

  /** 对发送入口执行 Redis 频控，限流命中时抛出 429 业务异常 */
  private async assertRateLimits(input: IssueSmsCodeInput): Promise<void> {
    const cooldownSet = await this.redis.getClient().set(this.getCooldownKey(input.scene, input.phone), '1', {
      NX: true,
      EX: SMS_RESEND_COOLDOWN_SECONDS,
    });
    if (cooldownSet !== 'OK') {
      throw new BusinessException(42901, '短信发送过于频繁，请稍后再试', 429);
    }

    await this.assertCounterLimit(
      this.getPhoneDailyKey(input.scene, input.phone),
      this.getSecondsUntilNextUtcDay(),
      SMS_PHONE_DAILY_LIMIT,
      '今日短信发送次数已达上限',
    );
    await this.assertCounterLimit(this.getGlobalMinuteKey(), 120, SMS_GLOBAL_MINUTE_LIMIT, '短信服务繁忙，请稍后再试');

    if (input.ip) {
      await this.assertCounterLimit(this.getIpMinuteKey(input.scene, input.ip), 120, SMS_IP_MINUTE_LIMIT, '当前网络短信发送过于频繁，请稍后再试');
      await this.assertCounterLimit(this.getIpHourKey(input.scene, input.ip), 7200, SMS_IP_HOUR_LIMIT, '当前网络短信发送次数已达上限');
    }
  }

  /** 递增带 TTL 的计数器并检查上限，Lua 保证首次计数和过期时间同时写入 */
  private async assertCounterLimit(key: string, ttlSeconds: number, limit: number, message: string): Promise<void> {
    const current = await this.redis.getClient().eval(INCR_WITH_TTL_SCRIPT, {
      keys: [key],
      arguments: [String(ttlSeconds)],
    });
    if (Number(current) > limit) {
      throw new BusinessException(42902, message, 429);
    }
  }

  /** 生成固定长度数字验证码，首位允许为 0 */
  private generateCode(): string {
    const max = 10 ** SMS_CODE_LENGTH;
    return crypto.randomInt(0, max).toString().padStart(SMS_CODE_LENGTH, '0');
  }

  /** 用服务端密钥对场景、手机号和验证码做 HMAC，Redis 主链路不保存明文 */
  private hashCode(scene: string, phone: string, code: string): string {
    return crypto.createHmac('sha256', this.authSettings.jwtSecret).update(`${scene}:${phone}:${code}`).digest('hex');
  }

  /** 计算到下一个 UTC 自然日的秒数，手机号日限 key 到期后自动释放 */
  private getSecondsUntilNextUtcDay(): number {
    const now = dayjs.utc();
    const nextDay = now.add(1, 'day').startOf('day');
    return Math.max(nextDay.diff(now, 'second'), 60);
  }

  /** 生成验证码主记录 key */
  private getCodeKey(scene: string, phone: string): string {
    return `auth:sms:code:${scene}:${phone}`;
  }

  /** 生成 debug 明文验证码 key */
  private getDebugCodeKey(scene: string, phone: string): string {
    return `auth:sms:debug-code:${scene}:${phone}`;
  }

  /** 生成同手机号同场景重发冷却 key */
  private getCooldownKey(scene: string, phone: string): string {
    return `auth:sms:cooldown:${scene}:${phone}`;
  }

  /** 生成手机号同场景日发送次数 key */
  private getPhoneDailyKey(scene: string, phone: string): string {
    return `auth:sms:daily:${scene}:${phone}:${this.getUtcDayKey()}`;
  }

  /** 生成 IP 同场景分钟级发送次数 key */
  private getIpMinuteKey(scene: string, ip: string): string {
    return `auth:sms:ip-minute:${scene}:${ip}:${dayjs().startOf('minute').valueOf()}`;
  }

  /** 生成 IP 同场景小时级发送次数 key */
  private getIpHourKey(scene: string, ip: string): string {
    return `auth:sms:ip-hour:${scene}:${ip}:${dayjs().startOf('hour').valueOf()}`;
  }

  /** 生成全局分钟级短信发送次数 key */
  private getGlobalMinuteKey(): string {
    return `auth:sms:global:${dayjs().startOf('minute').valueOf()}`;
  }

  /** 生成 UTC 日期片段，用于手机号日限 key */
  private getUtcDayKey(): string {
    return dayjs.utc().format('YYYYMMDD');
  }
}
