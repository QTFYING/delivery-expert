import { CanActivate, ExecutionContext, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { JwtPayload } from '../../auth/decorators/current-user.decorator';
import { RedisService } from '../../redis/redis.service';
import { BusinessException } from '../exceptions/business.exception';
import { formatTraceLog } from '../trace-log';
import { BURST_LIMIT_KEY, ResolvedBurstLimitOptions } from './burst-limit.constants';

const BURST_LIMIT_BIZ_CODE = 42901;
const OS_TENANT_SCOPE = 'os';
const UNKNOWN_ROUTE = 'unknown-route';

type BurstLimitRequest = Request & {
  user?: JwtPayload;
  route?: {
    path?: string;
  };
};

@Injectable()
export class BurstLimitGuard implements CanActivate {
  private readonly logger = new Logger(BurstLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  // 按用户 租户 HTTP 方法与路由模板做短窗口突发限制，忽略 query 参数
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<ResolvedBurstLimitOptions>(BURST_LIMIT_KEY, [context.getHandler(), context.getClass()]);
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<BurstLimitRequest>();
    const user = request.user;
    if (!user) {
      return true;
    }

    const key = this.buildBurstLimitKey(context, request, user);
    const acquired = await this.redis.setIfAbsentForMilliseconds(key, '1', options.windowMs);
    if (acquired) {
      return true;
    }

    this.logger.warn(
      formatTraceLog('burst_limit.denied', {
        code: BURST_LIMIT_BIZ_CODE,
        tenantId: user.tenantId ?? OS_TENANT_SCOPE,
        userId: user.userId,
        side: user.side,
        method: request.method,
        route: this.resolveRequestPath(request),
        routeKey: this.resolveRouteKey(context, request),
        windowMs: options.windowMs,
      }),
    );

    throw new BusinessException(BURST_LIMIT_BIZ_CODE, options.message, HttpStatus.TOO_MANY_REQUESTS);
  }

  // 生成 Redis key，平台侧与租户侧隔离，且不包含 query 参数
  private buildBurstLimitKey(context: ExecutionContext, request: BurstLimitRequest, user: JwtPayload): string {
    const tenantScope = user.tenantId ?? OS_TENANT_SCOPE;
    const routeKey = this.resolveRouteKey(context, request);
    return ['burst-limit', tenantScope, user.userId, request.method, routeKey].map(encodeURIComponent).join(':');
  }

  // 优先使用 Nest 路由模板，确保不同 query 参数仍归入同一个接口限制
  private resolveRouteKey(context: ExecutionContext, request: BurstLimitRequest): string {
    const classPath = this.reflector.get<string>('path', context.getClass()) ?? '';
    const methodPath = this.reflector.get<string>('path', context.getHandler()) ?? request.route?.path ?? '';
    const routePath = [classPath, methodPath]
      .filter((part) => part !== '')
      .join('/')
      .replace(/\/+/g, '/');

    return this.normalizeRouteKey(routePath || request.route?.path || UNKNOWN_ROUTE);
  }

  // 返回面向排障阅读的真实请求路径，不带 query 参数
  private resolveRequestPath(request: BurstLimitRequest): string {
    return request.originalUrl?.split('?')[0] || request.path || UNKNOWN_ROUTE;
  }

  // Redis key 使用稳定路由模板，去除首尾斜杠以避免 orders/ 这类展示噪音
  private normalizeRouteKey(routePath: string): string {
    const normalized = routePath.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
    return normalized || UNKNOWN_ROUTE;
  }
}
