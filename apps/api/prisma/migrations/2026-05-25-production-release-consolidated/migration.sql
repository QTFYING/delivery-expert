-- 生产上线合并迁移脚本
-- 基准：commit 69778ebccbea85889e13c089b7ef9cbd372d384c
-- 目标：合并原 3 份 migrations SQL，避免上线时多段迁移顺序不清
-- 执行建议：先备份数据库，再停 import-worker，执行本脚本，校验通过后更新 api，再恢复 worker

BEGIN;

-- 1. 支持商品行包装规格与 type=line 自定义字段持久化
-- 只新增可空字段，不回填历史数据
ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "packSpec" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "customerFieldValues" JSONB;

-- 2. 将历史自定义字段 key 从 customerKeyN 统一升级为 cfN
-- 只更新模板与已导入订单中的 JSON 快照，不调整表结构
CREATE OR REPLACE FUNCTION pg_temp.rename_import_customer_field_keys(value jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN value IS NULL THEN NULL
    WHEN jsonb_typeof(value) <> 'object' THEN value
    ELSE COALESCE(
      (
        SELECT jsonb_object_agg(
          CASE
            WHEN key ~ '^customerKey[0-9]+$' THEN 'cf' || substring(key FROM '^customerKey([0-9]+)$')
            ELSE key
          END,
          item
        )
        FROM jsonb_each(value) AS field(key, item)
      ),
      '{}'::jsonb
    )
  END;
$$;

UPDATE "import_templates"
SET "customerFields" = COALESCE(
  (
    SELECT jsonb_agg(
      CASE
        WHEN field.item ->> 'key' ~ '^customerKey[0-9]+$' THEN jsonb_set(
          field.item,
          '{key}',
          to_jsonb('cf' || substring(field.item ->> 'key' FROM '^customerKey([0-9]+)$')),
          false
        )
        ELSE field.item
      END
      ORDER BY field.ord
    )
    FROM jsonb_array_elements("customerFields"::jsonb) WITH ORDINALITY AS field(item, ord)
  ),
  '[]'::jsonb
)
WHERE jsonb_typeof("customerFields"::jsonb) = 'array'
  AND "customerFields"::text LIKE '%customerKey%';

UPDATE "orders"
SET "customerFieldValues" = pg_temp.rename_import_customer_field_keys("customerFieldValues"::jsonb)
WHERE "customerFieldValues" IS NOT NULL
  AND jsonb_typeof("customerFieldValues"::jsonb) = 'object'
  AND "customerFieldValues"::text LIKE '%customerKey%';

UPDATE "order_items"
SET "customerFieldValues" = pg_temp.rename_import_customer_field_keys("customerFieldValues"::jsonb)
WHERE "customerFieldValues" IS NOT NULL
  AND jsonb_typeof("customerFieldValues"::jsonb) = 'object'
  AND "customerFieldValues"::text LIKE '%customerKey%';

-- 3. orders.orderTime 恢复为本地业务时间 timestamp
SET LOCAL timezone = 'UTC';

ALTER TABLE "orders"
  ALTER COLUMN "orderTime" TYPE TIMESTAMP(3)
  USING "orderTime" AT TIME ZONE 'Asia/Shanghai';

COMMIT;
