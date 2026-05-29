BEGIN;

-- Tenant RBAC structure
CREATE TABLE "tenant_roles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" VARCHAR(10) NOT NULL,
  "code" VARCHAR(100) NOT NULL,
  "name" VARCHAR(50) NOT NULL,
  "description" VARCHAR(255),
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "isEditable" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdBy" UUID,
  "updatedBy" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "deletedAt" TIMESTAMPTZ(3),

  CONSTRAINT "tenant_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tenant_role_permissions" (
  "roleId" UUID NOT NULL,
  "permissionCode" VARCHAR(100) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tenant_role_permissions_pkey" PRIMARY KEY ("roleId", "permissionCode")
);

CREATE TABLE "user_role_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" VARCHAR(10) NOT NULL,
  "userId" UUID NOT NULL,
  "roleId" UUID NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_roles_tenantId_code_key" ON "tenant_roles"("tenantId", "code");
CREATE UNIQUE INDEX "tenant_roles_tenantId_id_key" ON "tenant_roles"("tenantId", "id");
CREATE UNIQUE INDEX "tenant_roles_active_name_key" ON "tenant_roles"("tenantId", lower("name")) WHERE "deletedAt" IS NULL;
CREATE INDEX "tenant_roles_tenantId_deletedAt_idx" ON "tenant_roles"("tenantId", "deletedAt");
CREATE INDEX "tenant_roles_tenantId_isSystem_sortOrder_idx" ON "tenant_roles"("tenantId", "isSystem", "sortOrder");

CREATE INDEX "tenant_role_permissions_permissionCode_idx" ON "tenant_role_permissions"("permissionCode");

CREATE UNIQUE INDEX "user_role_assignments_tenantId_userId_key" ON "user_role_assignments"("tenantId", "userId");
CREATE INDEX "user_role_assignments_tenantId_roleId_idx" ON "user_role_assignments"("tenantId", "roleId");

ALTER TABLE "tenant_roles"
  ADD CONSTRAINT "tenant_roles_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_role_permissions"
  ADD CONSTRAINT "tenant_role_permissions_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "tenant_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_role_assignments"
  ADD CONSTRAINT "user_role_assignments_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing index and constraint governance for this release
DROP INDEX IF EXISTS "users_tenantId_idx";
CREATE UNIQUE INDEX "users_tenantId_id_key" ON "users"("tenantId", "id");
CREATE INDEX "users_deletedAt_createdAt_idx" ON "users"("deletedAt", "createdAt");
CREATE INDEX "users_tenantId_deletedAt_role_status_idx" ON "users"("tenantId", "deletedAt", "role", "status");

CREATE INDEX "tenants_deletedAt_createdAt_idx" ON "tenants"("deletedAt", "createdAt");
CREATE INDEX "tenants_deletedAt_status_idx" ON "tenants"("deletedAt", "status");
CREATE INDEX "tenants_deletedAt_serviceExpireAt_idx" ON "tenants"("deletedAt", "serviceExpireAt");

DROP INDEX IF EXISTS "import_templates_tenantId_name_key";
DROP INDEX IF EXISTS "import_templates_tenantId_idx";
CREATE UNIQUE INDEX "import_templates_tenantId_id_key" ON "import_templates"("tenantId", "id");
CREATE UNIQUE INDEX "import_templates_active_name_key" ON "import_templates"("tenantId", lower("name")) WHERE "deletedAt" IS NULL;
CREATE INDEX "import_templates_tenantId_deletedAt_createdAt_idx" ON "import_templates"("tenantId", "deletedAt", "createdAt");

ALTER TABLE "printer_templates" DROP CONSTRAINT IF EXISTS "printer_templates_importTemplateId_fkey";
DROP INDEX IF EXISTS "printer_templates_importTemplateId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "printer_templates_tenantId_importTemplateId_key" ON "printer_templates"("tenantId", "importTemplateId");
ALTER TABLE "printer_templates"
  ADD CONSTRAINT "printer_templates_tenantId_importTemplateId_fkey"
  FOREIGN KEY ("tenantId", "importTemplateId") REFERENCES "import_templates"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "tenant_payment_configs_tenantId_status_idx";
CREATE INDEX "tenant_payment_configs_status_tenantId_idx" ON "tenant_payment_configs"("status", "tenantId");

DROP INDEX IF EXISTS "import_jobs_tenantId_status_idx";
CREATE INDEX "import_jobs_tenantId_status_createdAt_idx" ON "import_jobs"("tenantId", "status", "createdAt");

DROP INDEX IF EXISTS "orders_tenantId_sourceOrderNo_key";
DROP INDEX IF EXISTS "orders_tenantId_status_idx";
DROP INDEX IF EXISTS "orders_tenantId_payType_idx";
DROP INDEX IF EXISTS "orders_tenantId_orderTime_idx";
DROP INDEX IF EXISTS "orders_tenantId_payType_creditType_idx";
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_mappingTemplateId_fkey";
DROP INDEX IF EXISTS "orders_mappingTemplateId_idx";
CREATE UNIQUE INDEX "orders_active_sourceOrderNo_key" ON "orders"("tenantId", "sourceOrderNo") WHERE "deletedAt" IS NULL AND "sourceOrderNo" IS NOT NULL;
CREATE INDEX "orders_deletedAt_orderTime_idx" ON "orders"("deletedAt", "orderTime");
CREATE INDEX "orders_tenantId_deletedAt_orderTime_idx" ON "orders"("tenantId", "deletedAt", "orderTime");
CREATE INDEX "orders_tenantId_deletedAt_status_orderTime_idx" ON "orders"("tenantId", "deletedAt", "status", "orderTime");
CREATE INDEX "orders_tenantId_deletedAt_payType_creditDueDate_idx" ON "orders"("tenantId", "deletedAt", "payType", "creditDueDate");
CREATE INDEX "orders_tenantId_mappingTemplateId_idx" ON "orders"("tenantId", "mappingTemplateId");
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_tenantId_mappingTemplateId_fkey"
  FOREIGN KEY ("tenantId", "mappingTemplateId") REFERENCES "import_templates"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "payments_paidAt_idx" ON "payments"("paidAt");
CREATE INDEX "payments_channel_paidAt_idx" ON "payments"("channel", "paidAt");
CREATE INDEX "payments_status_paidAt_idx" ON "payments"("status", "paidAt");

DROP INDEX IF EXISTS "payment_orders_tenantId_status_idx";
DROP INDEX IF EXISTS "payment_orders_orderId_idx";
CREATE INDEX "payment_orders_tenantId_status_updatedAt_idx" ON "payment_orders"("tenantId", "status", "updatedAt");
CREATE INDEX "payment_orders_orderId_updatedAt_idx" ON "payment_orders"("orderId", "updatedAt");

CREATE INDEX "payment_webhook_events_paymentOrderId_receivedAt_idx" ON "payment_webhook_events"("paymentOrderId", "receivedAt");
CREATE INDEX "payment_webhook_events_orderId_receivedAt_idx" ON "payment_webhook_events"("orderId", "receivedAt");

ALTER TABLE "user_role_assignments"
  ADD CONSTRAINT "user_role_assignments_userId_fkey"
  FOREIGN KEY ("tenantId", "userId") REFERENCES "users"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_role_assignments"
  ADD CONSTRAINT "user_role_assignments_roleId_fkey"
  FOREIGN KEY ("tenantId", "roleId") REFERENCES "tenant_roles"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
