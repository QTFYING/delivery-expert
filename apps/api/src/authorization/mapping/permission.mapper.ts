import type { TenantPermissionTreeResponse } from '@shou/types/contracts';
import {
  TENANT_PERMISSION_DEFINITIONS,
  TENANT_PERMISSION_TREE_VERSION,
  type TenantPermissionDomainDefinition,
} from '../tenant-permission.definition';

export function toTenantPermissionTreeResponse(
  definitions: readonly TenantPermissionDomainDefinition[] = TENANT_PERMISSION_DEFINITIONS,
): TenantPermissionTreeResponse {
  return {
    version: TENANT_PERMISSION_TREE_VERSION,
    domains: definitions.map((domain) => ({
      domain: domain.domain,
      description: domain.description,
      permissions: domain.permissions.map((permission) => ({
        code: permission.code,
        description: permission.description,
      })),
    })),
  };
}
