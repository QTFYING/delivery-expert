-- 统一时间字段为 timestamptz(3)
-- 旧 timestamp without time zone 值按 Asia/Shanghai 业务时间解释，再转换为 UTC 绝对时刻存储。

BEGIN;

SET LOCAL timezone = 'UTC';

ALTER TABLE "tenants"
  ALTER COLUMN "serviceExpireAt" TYPE TIMESTAMPTZ(3) USING "serviceExpireAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "deletedAt" TYPE TIMESTAMPTZ(3) USING "deletedAt" AT TIME ZONE 'Asia/Shanghai';

ALTER TABLE "users"
  ALTER COLUMN "loginAt" TYPE TIMESTAMPTZ(3) USING "loginAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "deletedAt" TYPE TIMESTAMPTZ(3) USING "deletedAt" AT TIME ZONE 'Asia/Shanghai';

ALTER TABLE "tenant_general_settings"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'Asia/Shanghai';

ALTER TABLE "tenant_payment_configs"
  ALTER COLUMN "lastValidatedAt" TYPE TIMESTAMPTZ(3) USING "lastValidatedAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'Asia/Shanghai';

ALTER TABLE "import_templates"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "deletedAt" TYPE TIMESTAMPTZ(3) USING "deletedAt" AT TIME ZONE 'Asia/Shanghai';

ALTER TABLE "printer_templates"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'Asia/Shanghai';

ALTER TABLE "import_jobs"
  ALTER COLUMN "startedAt" TYPE TIMESTAMPTZ(3) USING "startedAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "heartbeatAt" TYPE TIMESTAMPTZ(3) USING "heartbeatAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "completedAt" TYPE TIMESTAMPTZ(3) USING "completedAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'Asia/Shanghai';

ALTER TABLE "orders"
  ALTER COLUMN "lastPrintedAt" TYPE TIMESTAMPTZ(3) USING "lastPrintedAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "lastFailedAt" TYPE TIMESTAMPTZ(3) USING "lastFailedAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "creditDueDate" TYPE TIMESTAMPTZ(3) USING "creditDueDate" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "orderTime" TYPE TIMESTAMPTZ(3) USING "orderTime" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "voidedAt" TYPE TIMESTAMPTZ(3) USING "voidedAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "deletedAt" TYPE TIMESTAMPTZ(3) USING "deletedAt" AT TIME ZONE 'Asia/Shanghai';

ALTER TABLE "payments"
  ALTER COLUMN "paidAt" TYPE TIMESTAMPTZ(3) USING "paidAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'Asia/Shanghai';

ALTER TABLE "payment_orders"
  ALTER COLUMN "offlineSubmittedAt" TYPE TIMESTAMPTZ(3) USING "offlineSubmittedAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "cashVerifiedAt" TYPE TIMESTAMPTZ(3) USING "cashVerifiedAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "lastInitiatedAt" TYPE TIMESTAMPTZ(3) USING "lastInitiatedAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "cashierExpiresAt" TYPE TIMESTAMPTZ(3) USING "cashierExpiresAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "paidAt" TYPE TIMESTAMPTZ(3) USING "paidAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'Asia/Shanghai';

ALTER TABLE "payment_webhook_events"
  ALTER COLUMN "receivedAt" TYPE TIMESTAMPTZ(3) USING "receivedAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "processedAt" TYPE TIMESTAMPTZ(3) USING "processedAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'Asia/Shanghai';

ALTER TABLE "order_print_records"
  ALTER COLUMN "printedAt" TYPE TIMESTAMPTZ(3) USING "printedAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'Asia/Shanghai';

ALTER TABLE "order_reminders"
  ALTER COLUMN "sentAt" TYPE TIMESTAMPTZ(3) USING "sentAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'Asia/Shanghai';

ALTER TABLE "notices"
  ALTER COLUMN "scheduledAt" TYPE TIMESTAMPTZ(3) USING "scheduledAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "publishAt" TYPE TIMESTAMPTZ(3) USING "publishAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'Asia/Shanghai';

ALTER TABLE "notice_reads"
  ALTER COLUMN "readAt" TYPE TIMESTAMPTZ(3) USING "readAt" AT TIME ZONE 'Asia/Shanghai';

ALTER TABLE "tenant_certifications"
  ALTER COLUMN "submitAt" TYPE TIMESTAMPTZ(3) USING "submitAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "reviewedAt" TYPE TIMESTAMPTZ(3) USING "reviewedAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'Asia/Shanghai';

ALTER TABLE "audit_logs"
  ALTER COLUMN "time" TYPE TIMESTAMPTZ(3) USING "time" AT TIME ZONE 'Asia/Shanghai';

COMMIT;
