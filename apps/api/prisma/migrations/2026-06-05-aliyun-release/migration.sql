-- 2026-06-05 阿里云上线合并迁移
-- 覆盖范围：账期类型、订单状态治理、线下登记命名、上传中心头像结构、Tenant RBAC 权限码收口
-- 执行前必须停止 api、payment-api、import-worker，并完成生产数据库备份

BEGIN;

-- 防止同一库上重复并发执行上线迁移；事务结束自动释放
SELECT pg_advisory_xact_lock(hashtextextended('shou-release-2026-06-05', 0));

-- 本次包含表字段重命名、枚举替换和索引创建，需要快速暴露锁等待风险
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

-- Tenant 账期提醒字段统一为 creditRemindDays
ALTER TABLE "tenants"
  RENAME COLUMN "creditReminderDays" TO "creditRemindDays";

-- 上传中心头像结构
CREATE TYPE "UploadSceneEnum" AS ENUM ('user_avatar');

CREATE TYPE "UploadObjectStatus" AS ENUM ('issued', 'uploaded', 'used', 'expired', 'deleted');

ALTER TABLE "users"
  ADD COLUMN "avatarObjectKey" VARCHAR(255);

CREATE TABLE "upload_objects" (
  "id" VARCHAR(40) NOT NULL,
  "scene" "UploadSceneEnum" NOT NULL,
  "tenantId" VARCHAR(10),
  "userId" UUID NOT NULL,
  "objectKey" VARCHAR(255) NOT NULL,
  "publicUrl" VARCHAR(500) NOT NULL,
  "originalFileName" VARCHAR(255) NOT NULL,
  "contentType" VARCHAR(100) NOT NULL,
  "size" INTEGER NOT NULL,
  "status" "UploadObjectStatus" NOT NULL DEFAULT 'issued',
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "uploadedAt" TIMESTAMPTZ(3),
  "usedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "upload_objects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "upload_objects_objectKey_key"
  ON "upload_objects"("objectKey");

CREATE INDEX "upload_objects_userId_scene_status_createdAt_idx"
  ON "upload_objects"("userId", "scene", "status", "createdAt");

CREATE INDEX "upload_objects_status_expiresAt_idx"
  ON "upload_objects"("status", "expiresAt");

CREATE INDEX "upload_objects_tenantId_scene_status_createdAt_idx"
  ON "upload_objects"("tenantId", "scene", "status", "createdAt");

ALTER TABLE "upload_objects"
  ADD CONSTRAINT "upload_objects_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 账期类型字段；历史 cash 订单保持 NULL，历史 credit 订单保守归为普通账期 period
CREATE TYPE "OrderCreditTypeEnum" AS ENUM ('month', 'week', 'period');

ALTER TABLE "orders"
  ADD COLUMN "creditType" "OrderCreditTypeEnum";

UPDATE "orders"
SET "creditType" = 'period'::"OrderCreditTypeEnum"
WHERE "payType" = 'credit'::"OrderPayTypeEnum"
  AND "creditType" IS NULL;

CREATE INDEX "orders_tenantId_payType_creditType_idx"
  ON "orders"("tenantId", "payType", "creditType");

-- 线下登记确认命名收口
ALTER TYPE "CashVerifyStatusEnum" RENAME TO "OfflinePaymentVerifyStatusEnum";

ALTER TABLE "payment_orders"
  RENAME COLUMN "cashVerifyStatus" TO "offlineVerifyStatus";

ALTER TABLE "payment_orders"
  RENAME COLUMN "cashVerifiedAt" TO "offlineVerifiedAt";

-- 订单状态治理：credit 回收到 payType=credit，作废独立为 voided
CREATE TYPE "OrderStatusEnum_new" AS ENUM ('pending', 'partial', 'paid', 'expired', 'voided');

ALTER TABLE "orders"
  ALTER COLUMN "status" DROP DEFAULT;

UPDATE "orders"
SET "status" = 'pending'::"OrderStatusEnum"
WHERE "status" = 'credit'::"OrderStatusEnum";

ALTER TABLE "orders"
  ALTER COLUMN "status" TYPE "OrderStatusEnum_new"
  USING (
    CASE
      WHEN "voided" = true THEN 'voided'::"OrderStatusEnum_new"
      ELSE "status"::text::"OrderStatusEnum_new"
    END
  );

ALTER TYPE "OrderStatusEnum" RENAME TO "OrderStatusEnum_old";
ALTER TYPE "OrderStatusEnum_new" RENAME TO "OrderStatusEnum";

ALTER TABLE "orders"
  ALTER COLUMN "status" SET DEFAULT 'pending'::"OrderStatusEnum";

DROP TYPE "OrderStatusEnum_old";

-- 同步 Tenant RBAC 历史权限码，避免角色列表映射时被闭集校验拒绝
DELETE FROM "tenant_role_permissions" legacy
USING "tenant_role_permissions" current
WHERE legacy."roleId" = current."roleId"
  AND legacy."permissionCode" = 'payments.cash_verify.create'
  AND current."permissionCode" = 'payments.offline_payment_verify.create';

UPDATE "tenant_role_permissions"
SET "permissionCode" = 'payments.offline_payment_verify.create'
WHERE "permissionCode" = 'payments.cash_verify.create';

COMMIT;
