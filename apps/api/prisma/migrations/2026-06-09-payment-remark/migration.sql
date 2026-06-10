-- 支付流水新增财务备注列
-- 财务确认 H5 线下登记时填写的审核备注，与 paidAt 同行承载

BEGIN;

ALTER TABLE "payments" ADD COLUMN "remark" VARCHAR(255);

COMMIT;

-- Tenant RBAC 权限码收口
-- 1. 打印配置权限从 settings 域迁移到 printing 域
-- 2. 订单作废权限并入 orders.manage
-- 3. 账期订单查看入口并入订单列表读取

BEGIN;

DELETE FROM "tenant_role_permissions" legacy
USING "tenant_role_permissions" current
WHERE legacy."roleId" = current."roleId"
  AND legacy."permissionCode" = 'settings.printing.read'
  AND current."permissionCode" = 'printing.config.read';

UPDATE "tenant_role_permissions"
SET "permissionCode" = 'printing.config.read'
WHERE "permissionCode" = 'settings.printing.read';

DELETE FROM "tenant_role_permissions" legacy
USING "tenant_role_permissions" current
WHERE legacy."roleId" = current."roleId"
  AND legacy."permissionCode" = 'settings.printing.update'
  AND current."permissionCode" = 'printing.config.update';

UPDATE "tenant_role_permissions"
SET "permissionCode" = 'printing.config.update'
WHERE "permissionCode" = 'settings.printing.update';

DELETE FROM "tenant_role_permissions" legacy
USING "tenant_role_permissions" current
WHERE legacy."roleId" = current."roleId"
  AND legacy."permissionCode" = 'orders.void'
  AND current."permissionCode" = 'orders.manage';

UPDATE "tenant_role_permissions"
SET "permissionCode" = 'orders.manage'
WHERE "permissionCode" = 'orders.void';

DELETE FROM "tenant_role_permissions" legacy
USING "tenant_role_permissions" current
WHERE legacy."roleId" = current."roleId"
  AND legacy."permissionCode" = 'credit.read'
  AND current."permissionCode" = 'orders.read';

UPDATE "tenant_role_permissions"
SET "permissionCode" = 'orders.read'
WHERE "permissionCode" = 'credit.read';

COMMIT;
