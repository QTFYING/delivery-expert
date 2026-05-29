import { Module } from '@nestjs/common';
import { PermissionCacheService } from './permission-cache.service';
import { PermissionService } from './permission.service';
import { PermissionsGuard } from './permissions.guard';

@Module({
  providers: [PermissionCacheService, PermissionService, PermissionsGuard],
  exports: [PermissionCacheService, PermissionService, PermissionsGuard],
})
export class AuthorizationModule {}
