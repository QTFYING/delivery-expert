-- 内置打单员角色收回映射模板管理权
-- 背景：
--   `templates.manage` 用于创建/更新映射模板（POST /import/templates、
--   PUT /import/templates/:id、GET /import/default-template），
--   `DEFAULT_TENANT_ROLE_PERMISSIONS[TENANT_OPERATOR]`
--   （apps/api/src/authorization/tenant-permission.definition.ts）
--   已移除该权限，新建租户的打单员不再默认拥有。
--
-- 本迁移把存量内置 TENANT_OPERATOR 角色上的 `templates.manage` 全部回收，
-- 与代码默认值对齐。
--
-- 边界：
--   - 仅作用于 code = 'TENANT_OPERATOR' 的角色，
--     租户自定义角色（CUSTOM_*）即使授予了 `templates.manage` 也不动，
--     由租户老板自行管理。
--   - 跳过 `deletedAt IS NOT NULL` 的角色，不影响软删除记录。
--   - 不删除权限码本身，`templates.manage` 在权限闭集中仍然有效，
--     仍可用于 TENANT_OWNER、租户自定义角色或手工授予。
--
-- 配套动作（应用层，由发布流程执行，本迁移不负责）：
--   - 清掉受影响用户的 Redis 权限快照：tenant-permissions:{tenantId}:{userId}
--   - 自增权限版本：tenant-permission-version:{tenantId}:{userId}
--     让旧 access token 在下次请求被 PermissionsGuard 判定过期，
--     前端按现有 4006 业务码刷新 /auth/me 即可。

BEGIN;

DELETE FROM "tenant_role_permissions" trp
USING "tenant_roles" tr
WHERE trp."roleId" = tr.id
  AND tr.code = 'TENANT_OPERATOR'
  AND tr."deletedAt" IS NULL
  AND trp."permissionCode" = 'templates.manage';

COMMIT;
