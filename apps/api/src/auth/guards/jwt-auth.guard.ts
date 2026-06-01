import { Injectable, ExecutionContext, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { formatTraceLog } from '../../common/trace-log';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  // 委托 passport-jwt 执行认证，认证结果统一在 handleRequest 收口
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  // 处理缺失、过期或无效 token 的拒绝日志，策略内业务拒绝不重复记录
  handleRequest(err: any, user: any, info?: unknown) {
    if (err || !user) {
      if (!err) {
        this.logger.warn(formatTraceLog('auth.jwt.denied', { reason: getJwtAuthGuardFailureReason(info) }));
      }
      throw err || new UnauthorizedException('Authentication Token is missing or invalid');
    }
    return user;
  }
}

function getJwtAuthGuardFailureReason(info: unknown): string {
  const message = info instanceof Error ? info.message : typeof info === 'string' ? info : '';
  if (message.includes('No auth token')) {
    return 'missing_token';
  }

  if (message.includes('jwt expired')) {
    return 'token_expired';
  }

  return 'token_invalid';
}
