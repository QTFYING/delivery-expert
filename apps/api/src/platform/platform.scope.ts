import { ForbiddenException } from '@nestjs/common';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';

export function ensurePlatformScope(currentUser: JwtPayload): void {
  if (currentUser.side !== 'platform' || currentUser.tenantId) {
    throw new ForbiddenException('当前登录态不属于平台侧');
  }
}
