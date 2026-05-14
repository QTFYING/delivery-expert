# 2026-05 生产库统一升级说明

本文档仅适用于把生产基线 `e1c99280e67d372949934e686b23333325477dc1` 升级到当前仓库状态。

## 1. 适用范围

适用于：

- 阿里云单机 ECS
- 1Panel 托管 PostgreSQL / Redis / OpenResty
- Docker Compose 仅运行 `api` 与 `import-worker`

## 2. 基线与目标

### 2.1 生产基线

生产基线为 `e1c99280e67d372949934e686b23333325477dc1`，核心特征：

- `tenants` 仍使用 `packageName`、`region`、`expireAt`
- `tenant_general_settings` 仍保存主体字段
- `PaymentChannelEnum` 仍使用 `pinan_bank`
- `orders.customerPhone` 仍为非空字符串字段

### 2.2 目标状态

目标为当前仓库 `schema.prisma`，核心特征：

- `tenants` 改为 `softwareVersion`、`address`、`licenseNo`、`serviceExpireAt`
- `tenant_general_settings` 仅保留通知与偏好字段
- `PaymentChannelEnum` 统一为 `pingan_bank`
- `orders.customerPhone` 改为 nullable

## 3. 统一迁移脚本

统一迁移脚本路径：

`apps/api/prisma/migrations/2026-05-production-baseline-to-current/migration.sql`

该脚本覆盖：

- `payment_orders` 新增 `cashierUrl`、`cashierExpiresAt`
- 支付渠道枚举新增 `shouqianba`
- `pinan_bank` 统一更名为 `pingan_bank`
- `tenants` 从旧租户字段收敛到当前字段
- `tenant_general_settings` 删除主体字段
- `orders.customerPhone` 改为 nullable

## 4. 执行前检查

先在生产 PostgreSQL 中执行：

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tenants'
ORDER BY ordinal_position;
```

```sql
SELECT enumlabel
FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'PaymentChannelEnum'
ORDER BY enumsortorder;
```

## 5. 执行顺序

1. 备份数据库。
2. 停止 `import-worker`。
3. 执行统一迁移脚本。
4. 校验 `tenants`、`tenant_general_settings`、`orders`、`PaymentChannelEnum`。
5. 更新并启动新版本 `api`。
6. 验证关键接口。
7. 恢复 `import-worker`。

## 6. 执行命令参考

停 worker：

```bash
docker compose stop import-worker
```

执行 SQL：

```bash
docker exec -i <postgres-container-name> psql -U <db-user> -d shou_db \
  < apps/api/prisma/migrations/2026-05-production-baseline-to-current/migration.sql
```

更新 API：

```bash
docker compose up -d --build api
```

验证 API：

```bash
docker compose logs -f api
curl http://127.0.0.1:3000/api/docs
```

恢复 worker：

```bash
docker compose up -d import-worker
```

## 7. 执行后验证

执行后建议检查：

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tenants'
  AND column_name IN (
    'packageName',
    'region',
    'expireAt',
    'softwareVersion',
    'address',
    'licenseNo',
    'serviceExpireAt'
  )
ORDER BY column_name;
```

预期只剩：

- `softwareVersion`
- `address`
- `licenseNo`
- `serviceExpireAt`

再检查：

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tenant_general_settings'
ORDER BY ordinal_position;
```

确认主体字段已不在该表中。

## 8. 风险说明

- 本次迁移包含删列、枚举重命名和数据归位，不是零风险迁移。
- 单机 ECS 无法做到真正零停机，只能做到低峰期低感知切换。
- 如果执行中断或发现结构异常，应优先停止继续发布应用，并基于备份回滚。
