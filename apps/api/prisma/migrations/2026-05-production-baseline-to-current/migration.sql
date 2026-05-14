-- 生产统一迁移脚本
-- 适用基线：commit e1c99280e67d372949934e686b23333325477dc1
-- 目标：当前仓库 schema.prisma
-- 执行建议：先备份数据库，再停 import-worker，执行本脚本，校验通过后更新 api，再恢复 worker。

BEGIN;

-- 1. payment_orders 新增聚合收银台地址与过期时间
ALTER TABLE "payment_orders"
ADD COLUMN IF NOT EXISTS "cashierUrl" TEXT,
ADD COLUMN IF NOT EXISTS "cashierExpiresAt" TIMESTAMP(3);

-- 2. 支付渠道闭集新增 shouqianba，并把 pinan_bank 统一更名为 pingan_bank
ALTER TYPE "PaymentChannelEnum" ADD VALUE IF NOT EXISTS 'shouqianba';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'PaymentChannelEnum'
      AND e.enumlabel = 'pinan_bank'
  ) THEN
    ALTER TYPE "PaymentChannelEnum" RENAME VALUE 'pinan_bank' TO 'pingan_bank';
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'PaymentChannelEnum'
      AND e.enumlabel = 'pingan_bank'
  ) THEN
    ALTER TYPE "PaymentChannelEnum" ADD VALUE 'pingan_bank';
  END IF;
END
$$;

UPDATE "payments"
SET "channel" = 'pingan_bank'
WHERE "channel"::text = 'pinan_bank';

UPDATE "payment_orders"
SET "channel" = 'pingan_bank'
WHERE "channel"::text = 'pinan_bank';

UPDATE "tenant_payment_configs"
SET "channel" = 'pingan_bank'
WHERE "channel"::text = 'pinan_bank';

UPDATE "tenants"
SET "activePaymentChannel" = 'pingan_bank'
WHERE "activePaymentChannel"::text = 'pinan_bank';

-- 3. tenants 统一改为软件版本 + 主体资料入主表 + 服务到期时间
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'TenantSoftwareVersionEnum'
  ) THEN
    CREATE TYPE "TenantSoftwareVersionEnum" AS ENUM ('L1', 'L2', 'L3');
  END IF;
END
$$;

ALTER TABLE "tenants"
ADD COLUMN IF NOT EXISTS "softwareVersion" "TenantSoftwareVersionEnum",
ADD COLUMN IF NOT EXISTS "address" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "licenseNo" VARCHAR(100),
ADD COLUMN IF NOT EXISTS "serviceExpireAt" TIMESTAMP(3);

UPDATE "tenants"
SET "serviceExpireAt" = "expireAt"
WHERE "serviceExpireAt" IS NULL
  AND "expireAt" IS NOT NULL;

UPDATE "tenants"
SET "address" = COALESCE("address", "region")
WHERE "region" IS NOT NULL;

UPDATE "tenants" AS "tenant"
SET "address" = COALESCE("tenant"."address", "settings"."address"),
    "licenseNo" = COALESCE("tenant"."licenseNo", "settings"."licenseNo")
FROM "tenant_general_settings" AS "settings"
WHERE "settings"."tenantId" = "tenant"."id";

UPDATE "tenants"
SET "softwareVersion" = 'L1'
WHERE "softwareVersion" IS NULL;

ALTER TABLE "tenants"
ALTER COLUMN "softwareVersion" SET DEFAULT 'L1',
ALTER COLUMN "softwareVersion" SET NOT NULL;

ALTER TABLE "tenants"
DROP COLUMN IF EXISTS "packageName",
DROP COLUMN IF EXISTS "region",
DROP COLUMN IF EXISTS "expireAt";

-- 4. tenant_general_settings 删除已迁移到 tenants 主表的主体字段
ALTER TABLE "tenant_general_settings"
DROP COLUMN IF EXISTS "companyName",
DROP COLUMN IF EXISTS "contactPerson",
DROP COLUMN IF EXISTS "contactPhone",
DROP COLUMN IF EXISTS "address",
DROP COLUMN IF EXISTS "licenseNo";

-- 5. orders.customerPhone 历史空字符串规范化后改为 nullable
UPDATE "orders"
SET "customerPhone" = NULL
WHERE "customerPhone" = '';

ALTER TABLE "orders"
ALTER COLUMN "customerPhone" DROP DEFAULT,
ALTER COLUMN "customerPhone" DROP NOT NULL;

COMMIT;
