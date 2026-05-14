import { ForbiddenException } from '@nestjs/common';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';

export function getImportTenantId(currentUser: JwtPayload): string {
  if (!currentUser.tenantId) {
    throw new ForbiddenException('当前登录态不属于租户侧，无法执行导入功能');
  }

  return currentUser.tenantId;
}
