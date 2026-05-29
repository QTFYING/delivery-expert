import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserRole } from '@shou/types/enums';

export interface JwtPayload {
  userId: string;
  tenantId: string | null;
  role: UserRole;
  side: 'platform' | 'tenant';
  sessionId: string;
  tokenVersion: number;
  permissionVersion: number;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): JwtPayload => {
  const request = ctx.switchToHttp().getRequest();
  return request.user; // Expected to be injected by JwtAuthGuard
});
