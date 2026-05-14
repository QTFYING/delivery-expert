# ID 体系改造方案

> shou_db 17 张表从统一 UUID 改为按业务特性分类设计

## 背景

所有表的 id 均为 UUID（`gen_random_uuid()`），在业务可读性（客服排查、对账）、B-tree 写入性能（页分裂）、运营沟通效率方面存在不足。

## 设计方案

### 一、按天重置业务编号

机制：`id_sequences` 表 + `INSERT ON CONFLICT RETURNING`，每天序号自动从 1 开始，无需人工干预，纯 PostgreSQL 实现。

| 表                   | 前缀 | 格式                 | 示例                | 日容量   |
| -------------------- | ---- | -------------------- | ------------------- | -------- |
| orders               | ORD  | ORD + YYYYMMDD + 6位 | `ORD20260416000001` | 100万/天 |
| payments             | PAY  | PAY + YYYYMMDD + 6位 | `PAY20260416000001` | 100万/天 |
| payment_orders       | PO   | PO + YYYYMMDD + 6位  | `PO20260416000001`  | 100万/天 |
| import_jobs          | IJ   | IJ + YYYYMMDD + 5位  | `IJ2026041600001`   | 10万/天  |
| order_reminders      | RMD  | RMD + YYYYMMDD + 5位 | `RMD2026041600001`  | 10万/天  |
| print_record_batches | PRB  | PRB + YYYYMMDD + 5位 | `PRB2026041600001`  | 10万/天  |

### 二、全局递增编号

机制：PostgreSQL Sequence，`SELECT nextval()` 获取。

| 表                    | 前缀 | 格式       | 示例        | Sequence                |
| --------------------- | ---- | ---------- | ----------- | ----------------------- |
| tenants               | T    | T + 6位    | `T100001`   | tenant_seq START 100001 |
| notices               | NTC  | NTC + 5位  | `NTC00001`  | notice_seq START 1      |
| tenant_certifications | CERT | CERT + 5位 | `CERT00001` | cert_seq START 1        |

### 三、保留 UUID

| 表    | 理由                                                        |
| ----- | ----------------------------------------------------------- |
| users | 防枚举攻击，用户 ID 出现在 JWT/URL 中，不可预测性是安全优势 |

### 四、BigInt 自增

| 表                | 理由                                       |
| ----------------- | ------------------------------------------ |
| order_items       | 子表，永远通过 orderId 关联，从不独立引用  |
| import_templates  | 内部配置，量少，通过唯一约束定位           |
| printer_templates | 同上                                       |
| audit_logs        | 高频 append-only，自增对 B-tree 写性能最优 |

### 五、去掉独立 id，使用自然主键

| 表                      | 新主键                                  | 理由                          |
| ----------------------- | --------------------------------------- | ----------------------------- |
| notice_reads            | 复合主键 `(noticeId, tenantId, userId)` | 已有唯一约束，id 列多余       |
| tenant_general_settings | `tenantId` 做主键                       | 与 tenant 严格 1:1，id 列多余 |

### 六、不变

| 表             | 理由                                          |
| -------------- | --------------------------------------------- |
| system_configs | 已是复合主键 `(group, key)`，本身就是最佳设计 |

## 关键实现

### ID 生成器

- 位置：`apps/api/src/id-generator/`
- `IdGeneratorService.nextDailyId(prefix, digits)` — 按天重置
- `IdGeneratorService.nextGlobalId(prefix, seqName, digits)` — 全局递增
- 配置常量：`id-generator.constants.ts` 中的 `ID_CONFIG`

### 数据库依赖

- `id_sequences` 表（Prisma schema 中声明）— 按天重置的计数器
- 3 个 PostgreSQL Sequence（`db-init.js` 幂等创建）— 全局递增

### 级联外键类型变更

- `tenantId`（UUID → VarChar(10)）— 涉及 13 张表
- `orderId`（UUID → VarChar(20)）— 涉及 4 张表
- `noticeId`（UUID → VarChar(10)）— notice_reads
- `importTemplateId`（UUID → BigInt）— printer_templates、orders

## 初始化流程

```bash
pnpm -F api exec prisma db push --force-reset   # 重建库结构
node scripts/db-init.js                           # 创建 sequence + 初始数据
```
