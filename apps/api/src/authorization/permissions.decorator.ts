import { SetMetadata } from '@nestjs/common';
import type { TenantPermissionCode } from '@shou/types/enums';

export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...permissions: TenantPermissionCode[]) => SetMetadata(PERMISSIONS_KEY, permissions);
