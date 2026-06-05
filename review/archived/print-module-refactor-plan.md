# 打印模块重构执行计划

> 文档状态：已完成，已归档

> **文档性质**：可执行落地计划，供 AI 代理（Claude Code / Codex 等）逐步实施。  
> **生成日期**：2026-04-24  
> **事实源优先级**（如有冲突，按此顺序判断）：
>
> 1. `docs/api/tenant-api-doc.md`（接口契约）
> 2. `packages/types/src/enums/`
> 3. `packages/types/src/contracts/`
> 4. `docs/prisma/data-model-reference.md`
> 5. `apps/api` 实现代码

---

## 目标

将打印相关模块从"批次幂等记录"升级为"事件流追溯"：

1. 删除 `print_record_batches` 表及其所有关联代码
2. 新增 `order_print_records` 表（成功 + 失败不可变事件流）
3. 对 `orders` 表新增三个 denormalized 缓存列
4. 新增三个接口：打印失败上报、单订单打印历史、跨订单打印追溯
5. 提取新 service 文件 `order-print.service.ts`（触发 order-finance.service.ts 行数上限）

---

## 强制前置阅读

在动任何代码前，必须先完整阅读：

```
AGENTS.md
docs/api/tenant-api-doc.md   ← 接口契约权威，重点看 3.13–3.16 节
apps/api/prisma/schema.prisma
apps/api/src/order/order-finance.service.ts
apps/api/src/order/order.shared.ts
apps/api/src/order/order.controller.ts
apps/api/src/id-generator/id-generator.constants.ts
apps/api/test/regression/runner.js
```

---

## 变更文件清单

| 文件                                                       | 动作                                         |
| ---------------------------------------------------------- | -------------------------------------------- |
| `apps/api/prisma/schema.prisma`                            | 删模型 + 加模型 + 改列                       |
| `apps/api/prisma/migrations/`                              | 新增 migration（自动生成）                   |
| `apps/api/src/id-generator/id-generator.constants.ts`      | 新增 `ORDER_PRINT` 条目，删除 `PRINT_RECORD` |
| `packages/types/src/enums/order.ts`                        | 新增 `PrintRecordResultEnum`                 |
| `packages/types/src/enums/index.ts`                        | 确认 re-export 新枚举                        |
| `packages/types/src/contracts/order.ts`                    | 新增 3 组接口；更新 `TenantOrderItem`        |
| `packages/types/src/contracts/index.ts`                    | 确认 re-export 新接口                        |
| `apps/api/src/order/dto/create-order-print-record.dto.ts`  | 更新注释（去"批次"措辞）                     |
| `apps/api/src/order/dto/create-order-print-failure.dto.ts` | 新建                                         |
| `apps/api/src/order/dto/query-order-print-records.dto.ts`  | 新建（单订单 + 跨订单共用）                  |
| `apps/api/src/order/order-print.service.ts`                | 新建（承接 createPrintRecord + 新三方法）    |
| `apps/api/src/order/order-finance.service.ts`              | 删除 `createPrintRecord` 方法及其 imports    |
| `apps/api/src/order/order.controller.ts`                   | 新增 3 个 endpoint，注入 `OrderPrintService` |
| `apps/api/src/order/order.module.ts`                       | 注册 `OrderPrintService`                     |
| `apps/api/src/order/order.swagger.ts`                      | 新增 Swagger 响应类                          |
| `apps/api/test/regression/runner.js`                       | 替换 `printRecordBatch.deleteMany`           |
| `docs/prisma/data-model-reference.md`                      | 同步新表、新列、删旧表                       |
| `docs/enums/enum-manual.md`                                | 新增 `PrintRecordResultEnum` 条目            |

> `docs/api/tenant-api-doc.md` 已在本轮设计阶段更新完毕，**无需再改**。

---

## Step 1：Prisma Schema

文件：`apps/api/prisma/schema.prisma`

### 1-A 新增枚举

在现有枚举区块末尾添加：

```prisma
enum PrintRecordResultEnum {
  SUCCESS @map("success")
  FAILED  @map("failed")
}
```

### 1-B 修改 `Order` 模型

在 `prints Int @default(0)` 后面追加三列（顺序固定）：

```prisma
  prints            Int       @default(0)
  lastPrintedAt     DateTime?                      // 最近一次打印成功时间；成功回执写入时更新
  printFailedCount  Int       @default(0)          // 累计打印失败次数；失败上报写入时更新
  lastFailedAt      DateTime?                      // 最近一次打印失败时间；失败上报写入时更新
```

在 `Order` 模型的 relation 区块末尾添加：

```prisma
  printRecords      OrderPrintRecord[]
```

### 1-C 删除 `PrintRecordBatch` 模型

删除 schema.prisma 中的完整 `model PrintRecordBatch { ... }` 块。

删除 `Tenant` 模型中的：

```prisma
  printRecordBatches PrintRecordBatch[]
```

删除 `User` 模型中的：

```prisma
  printRecordBatches PrintRecordBatch[] @relation("PrintRecordBatchOperator")
```

### 1-D 新增 `OrderPrintRecord` 模型

在 `model OrderReminder` 之前插入：

```prisma
/// 订单打印事件记录（不可变 append-only 事件流）
/// 来源：POST /orders/print-records（成功）或 POST /orders/{id}/print-failures（失败）
model OrderPrintRecord {
  id            String                  @id @db.VarChar(20)
  tenantId      String                  @db.VarChar(10)
  orderId       String                  @db.VarChar(20)
  operatorId    String?                 @db.Uuid
  operatorName  String?                 @db.VarChar(50)   // 操作人姓名快照，User 改名后历史仍可读
  result        PrintRecordResultEnum
  failureReason String?                 @db.VarChar(500)  // 仅 FAILED 有值
  printedAt     DateTime                @default(now())   // 事件时间；失败场景为"尝试打印时间"
  requestId     String?                 @db.VarChar(100)  // 幂等号；成功/失败端点均可传
  remark        String?                 @db.VarChar(255)
  createdAt     DateTime                @default(now())

  tenant   Tenant @relation(fields: [tenantId], references: [id])
  order    Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  operator User?  @relation("OrderPrintRecordOperator", fields: [operatorId], references: [id])

  @@index([tenantId, orderId, printedAt(sort: Desc)])   // 单订单时间线查询
  @@index([tenantId, printedAt(sort: Desc)])            // 跨订单按时间查询
  @@index([tenantId, result, printedAt(sort: Desc)])    // 按结果过滤查询
  @@unique([tenantId, requestId], map: "order_print_records_tenant_request_key")

  @@map("order_print_records")
}
```

在 `Tenant` 模型 relation 区块添加：

```prisma
  orderPrintRecords OrderPrintRecord[]
```

在 `User` 模型 relation 区块添加：

```prisma
  orderPrintRecords OrderPrintRecord[] @relation("OrderPrintRecordOperator")
```

---

## Step 2：生成数据库 Migration

```bash
cd apps/api
pnpm prisma migrate dev --name add_order_print_records_drop_print_record_batches
```

验证：

- `prisma/migrations/` 下出现新 migration 目录
- migration SQL 包含 `CREATE TABLE order_print_records`、`DROP TABLE print_record_batches`、`ALTER TABLE orders ADD COLUMN last_printed_at`

---

## Step 3：ID 生成常量

文件：`apps/api/src/id-generator/id-generator.constants.ts`

```typescript
export const ID_CONFIG = {
  ORDER: { prefix: 'ORD', digits: 6 },
  PAYMENT: { prefix: 'PAY', digits: 6 },
  PAYMENT_ORDER: { prefix: 'PO', digits: 6 },
  IMPORT_JOB: { prefix: 'IJ', digits: 5 },
  ORDER_REMINDER: { prefix: 'RMD', digits: 5 },
  ORDER_PRINT: { prefix: 'OPR', digits: 5 }, // ← 新增，替代已删除的 PRINT_RECORD
  // PRINT_RECORD 条目已删除（print_record_batches 表已移除）
  TENANT: { prefix: 'T', seqName: 'tenant_seq', digits: 6 },
  NOTICE: { prefix: 'NTC', seqName: 'notice_seq', digits: 5 },
  CERTIFICATION: { prefix: 'CERT', seqName: 'cert_seq', digits: 5 },
} as const;
```

---

## Step 4：共享类型层

### 4-A `packages/types/src/enums/order.ts`

在文件末尾追加：

```typescript
/**
 * 打印事件结果
 */
export const PrintRecordResultEnum = {
  /** 打印成功 */
  SUCCESS: 'success',
  /** 打印失败 */
  FAILED: 'failed',
} as const;

export type PrintRecordResult = EnumValue<typeof PrintRecordResultEnum>;
```

### 4-B `packages/types/src/enums/index.ts`

确认导出新枚举（如果该文件是 barrel 导出则无需手动添加；如需手动，追加）：

```typescript
export { PrintRecordResultEnum } from './order';
export type { PrintRecordResult } from './order';
```

### 4-C `packages/types/src/contracts/order.ts`

**1. 更新 `TenantOrderItem`**，在 `prints` 后追加三个字段：

```typescript
export interface TenantOrderItem {
  // ...现有字段...
  prints: number;
  lastPrintedAt?: string; // 最近一次打印成功时间；从未打印时为空
  printFailedCount: number; // 累计打印失败次数
  lastFailedAt?: string; // 最近一次打印失败时间；从未失败时为空
  // ...其余现有字段...
}
```

**2. 删除旧接口**（如文件中存在）：

```typescript
// 删除 OrderPrintRecordRequest、OrderPrintRecordResponse（待下方重新定义）
```

**3. 新增全部打印相关接口**：

```typescript
// ─── 3.13  打印成功回执 ───────────────────────────────────────────────────
export interface OrderPrintRecordRequest {
  orderIds: string[];
  requestId?: string;
  remark?: string;
}

export interface OrderPrintRecordResponse {
  requestId?: string;
  totalCount: number;
  successCount: number;
  confirmedAt: string;
  remark?: string;
}

// ─── 3.14  打印失败上报 ───────────────────────────────────────────────────
export interface CreateOrderPrintFailureRequest {
  reason: string;
  requestId?: string;
  remark?: string;
}

export interface CreateOrderPrintFailureResponse {
  id: string;
  orderId: string;
  reason: string;
  printedAt: string;
  operatorName: string | null;
}

// ─── 3.15  单订单打印历史 ─────────────────────────────────────────────────
export interface OrderPrintRecordsQuery {
  page?: number;
  pageSize?: number;
  result?: PrintRecordResult;
  dateFrom?: string;
  dateTo?: string;
}

export interface OrderPrintRecordItem {
  id: string;
  result: PrintRecordResult;
  failureReason: string | null;
  printedAt: string;
  operatorId: string | null;
  operatorName: string | null;
  requestId: string | null;
  remark: string | null;
}

export interface OrderPrintRecordsSummary {
  successCount: number;
  failedCount: number;
  lastPrintedAt: string | null;
  lastFailedAt: string | null;
}

export interface OrderPrintRecordsResponse {
  list: OrderPrintRecordItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: OrderPrintRecordsSummary;
}

// ─── 3.16  跨订单打印追溯 ─────────────────────────────────────────────────
export interface TenantPrintRecordsQuery {
  page?: number;
  pageSize?: number;
  result?: PrintRecordResult;
  dateFrom?: string;
  dateTo?: string;
  operatorId?: string;
  orderId?: string;
  keyword?: string;
}

export interface TenantPrintRecordItem extends OrderPrintRecordItem {
  orderId: string;
  sourceOrderNo: string;
  customer: string;
}

export interface TenantPrintRecordsResponse {
  list: TenantPrintRecordItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    successCount: number;
    failedCount: number;
  };
}
```

---

## Step 5：DTO 文件

### 5-A 更新现有 DTO（`create-order-print-record.dto.ts`）

仅更新 `requestId` 字段的注释：

```typescript
@ApiPropertyOptional({ description: '建议填写；同租户下用于本次提交的幂等识别' })
```

### 5-B 新建 `apps/api/src/order/dto/create-order-print-failure.dto.ts`

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOrderPrintFailureDto {
  @ApiProperty({ description: '打印失败原因，如"打印机卡纸"、"驱动超时"', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ description: '建议填写；同租户下用于单条失败的幂等识别' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  requestId?: string;

  @ApiPropertyOptional({ description: '备注，预留扩展' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}
```

### 5-C 新建 `apps/api/src/order/dto/query-order-print-records.dto.ts`

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PrintRecordResultEnum } from '@shou/types/enums';
import type { PrintRecordResult } from '@shou/types/enums';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

// 单订单历史查询
export class QueryOrderPrintRecordsDto {
  @ApiPropertyOptional({ description: '页码', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页条数', default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pageSize?: number = 20;

  @ApiPropertyOptional({ enum: PrintRecordResultEnum, description: '不传返回混合时间线' })
  @IsOptional()
  @IsEnum(PrintRecordResultEnum)
  result?: PrintRecordResult;

  @ApiPropertyOptional({ description: '按 printedAt 过滤起始日期 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: '按 printedAt 过滤结束日期 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

// 跨订单追溯查询（继承 + 扩展筛选维度）
export class QueryTenantPrintRecordsDto extends QueryOrderPrintRecordsDto {
  @ApiPropertyOptional({ default: 50, description: '每页条数（跨订单视图默认 50）' })
  pageSize?: number = 50;

  @ApiPropertyOptional({ description: '精确筛选操作人 UUID' })
  @IsOptional()
  @IsUUID()
  operatorId?: string;

  @ApiPropertyOptional({ description: '精确筛选订单 ID' })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({ description: '模糊匹配订单源单号 / 客户名称' })
  @IsOptional()
  @IsString()
  keyword?: string;
}
```

---

## Step 6：新建 `order-print.service.ts`

文件路径：`apps/api/src/order/order-print.service.ts`

### 方法概览

| 方法                    | 来源                                       | 说明                                         |
| ----------------------- | ------------------------------------------ | -------------------------------------------- |
| `createPrintRecord`     | 从 order-finance.service.ts **迁移并重写** | 去掉 PrintRecordBatch，改写 OrderPrintRecord |
| `createPrintFailure`    | 新增                                       | 单条失败上报，写审计                         |
| `getOrderPrintRecords`  | 新增                                       | 单订单时间线                                 |
| `getTenantPrintRecords` | 新增                                       | 跨订单追溯                                   |

### 依赖注入（构造函数）

```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly idGen: IdGeneratorService,
  private readonly auditService: AuditService,  // 参考 order-finance.service.ts 中审计写入方式
) {}
```

> 参考现有审计写入方式：在 order-finance.service.ts 中搜索 `createAuditLog` 或 `auditLog` 的调用模式，保持一致。

### `createPrintRecord` 重写要点

```
1. 不再创建 PrintRecordBatch 行
2. 对 orderIds 做 assertAllOrdersOwned 校验
3. 幂等检查：若传入 requestId，先查 prisma.orderPrintRecord.findFirst({ where: { tenantId, requestId } })
   - 命中则直接返回原结果（不重复写）
4. 在同一事务中：
   a. 为每条 orderId 生成 ID（idGen.nextDailyId(ID_CONFIG.ORDER_PRINT.prefix, ...)）
   b. prisma.orderPrintRecord.createMany({ data: orderIds.map(orderId => ({
        id, tenantId, orderId, operatorId, operatorName（需 getOrderActorName），
        result: 'success', requestId（只给第一条），printedAt: now, remark
      })) })
   c. prisma.order.updateMany({
        where: { tenantId, id: { in: orderIds } },
        data: { prints: { increment: 1 }, lastPrintedAt: now }
      })
5. 返回：{ requestId, totalCount, successCount: orderIds.length, confirmedAt, remark }
```

> `requestId` 仅挂在 `orderIds[0]` 对应行（避免唯一索引冲突）。若前端同一批次下不需要逐条追溯，此方案够用。若未来需要每条都有 requestId，改为前端传 `items[]` 结构，届时修改契约。

### `createPrintFailure` 实现要点

```
1. 校验 orderId 归属租户（count by tenantId+orderId，不存在则 throw NotFoundException）
2. 幂等：若传 requestId，先查 orderPrintRecord({ tenantId, requestId })，命中直接返回
3. 生成 id（ID_CONFIG.ORDER_PRINT）
4. 在事务中：
   a. prisma.orderPrintRecord.create({
        id, tenantId, orderId, operatorId, operatorName,
        result: 'failed', failureReason: reason, requestId, printedAt: now, remark
      })
   b. prisma.order.update({
        where: { id: orderId },
        data: { printFailedCount: { increment: 1 }, lastFailedAt: now }
      })
5. 写审计日志，action = '打印失败记录'（参考 createReminder 写法）
6. 返回：{ id, orderId, reason, printedAt, operatorName }
```

### `getOrderPrintRecords` 实现要点

```
1. 校验订单归属租户
2. 构建 where 条件：{ tenantId, orderId, result?, printedAt: { gte: dateFrom, lte: dateTo } }
3. 并发执行：
   - prisma.orderPrintRecord.findMany（分页，orderBy printedAt desc）
   - prisma.orderPrintRecord.count（同 where，不分页）
4. summary 直接从 orders 记录读取（lastPrintedAt, printFailedCount, lastFailedAt, prints）
   ← 不要聚合 orderPrintRecord，直接用 Order 上的 denormalized 列
5. 映射 result 字段（Prisma 枚举值 → 字符串）
6. 返回 { list, total, page, pageSize, summary }
```

### `getTenantPrintRecords` 实现要点

```
1. where 条件：{ tenantId, result?, printedAt: { gte, lte }, operatorId?, orderId? }
2. keyword 过滤：JOIN orders 表按 sourceOrderNo / customer 做 contains 查询
   （Prisma: where: { order: { OR: [{ sourceOrderNo: { contains: keyword } }, { customer: { contains: keyword } }] } }）
3. summary 用两次 prisma.orderPrintRecord.count（where + result=success/failed），或单次 groupBy
4. list 中每条需要 JOIN Order { sourceOrderNo, customer }（Prisma include: { order: { select: { sourceOrderNo, customer } } }）
5. 返回 { list（含 sourceOrderNo / customer 字段）, total, page, pageSize, summary }
```

---

## Step 7：修改 `order-finance.service.ts`

1. **删除 `createPrintRecord` 方法**（整个方法体 + 相关局部类型）
2. **删除 imports** 中不再需要的引用：
   - `ID_CONFIG.PRINT_RECORD`（已删除）
   - `OrderPrintRecordRequest / Response`（已迁移到 order-print.service.ts）
   - `printRecordBatch` 相关 Prisma 类型

> 删除后验证文件行数 ≤ 400 行。

---

## Step 8：修改 `order.controller.ts`

### 8-A 注入 `OrderPrintService`

```typescript
constructor(
  private readonly orderService: OrderService,
  private readonly orderFinanceService: OrderFinanceService,
  private readonly orderPrintService: OrderPrintService,  // ← 新增
) {}
```

### 8-B 修改现有 print-records endpoint

```typescript
@Post('print-records')
@Roles(UserRoleEnum.TENANT_OWNER, UserRoleEnum.TENANT_OPERATOR)
async createPrintRecord(@CurrentUser() currentUser: JwtPayload, @Body() body: CreateOrderPrintRecordDto) {
  return this.orderPrintService.createPrintRecord(currentUser, body);
}
```

### 8-C 新增三个 endpoint（顺序与 API 文档对齐）

```typescript
// 3.14  打印失败上报
@ApiOperation({ summary: '上报打印失败记录' })
@Post(':id/print-failures')
@Roles(UserRoleEnum.TENANT_OWNER, UserRoleEnum.TENANT_OPERATOR)
async createPrintFailure(
  @CurrentUser() currentUser: JwtPayload,
  @Param('id') orderId: string,
  @Body() body: CreateOrderPrintFailureDto,
): Promise<CreateOrderPrintFailureResponse> {
  return this.orderPrintService.createPrintFailure(currentUser, orderId, body);
}

// 3.15  单订单打印历史
@ApiOperation({ summary: '获取单订单打印历史' })
@Get(':id/print-records')
@Roles(UserRoleEnum.TENANT_OWNER, UserRoleEnum.TENANT_OPERATOR, UserRoleEnum.TENANT_FINANCE, UserRoleEnum.TENANT_VIEWER)
async getOrderPrintRecords(
  @CurrentUser() currentUser: JwtPayload,
  @Param('id') orderId: string,
  @Query() query: QueryOrderPrintRecordsDto,
): Promise<OrderPrintRecordsResponse> {
  return this.orderPrintService.getOrderPrintRecords(currentUser, orderId, query);
}

// 3.16  跨订单打印追溯
@ApiOperation({ summary: '跨订单打印事件追溯' })
@Get('print-records')
@Roles(UserRoleEnum.TENANT_OWNER, UserRoleEnum.TENANT_FINANCE)
async getTenantPrintRecords(
  @CurrentUser() currentUser: JwtPayload,
  @Query() query: QueryTenantPrintRecordsDto,
): Promise<TenantPrintRecordsResponse> {
  return this.orderPrintService.getTenantPrintRecords(currentUser, query);
}
```

> **路由顺序注意**：`GET /orders/print-records`（Step 8-C 最后一个）必须声明在 `GET /orders/:id/print-records` **之前**，否则 NestJS 会把 `print-records` 匹配成 `:id`。在控制器中按"精确路由在前"原则排列。

---

## Step 9：修改 `order.module.ts`

```typescript
import { OrderPrintService } from './order-print.service';

@Module({
  providers: [
    OrderService,
    OrderFinanceService,
    OrderPrintService,   // ← 新增
    // ...其他 provider
  ],
  // ...
})
```

---

## Step 10：补充 Swagger（`order.swagger.ts`）

新增以下 Swagger 响应类（参考文件内现有模式，使用 `@ApiProperty`）：

```typescript
export class CreateOrderPrintFailureResponseSwagger {
  @ApiProperty() id!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty() reason!: string;
  @ApiProperty() printedAt!: string;
  @ApiProperty({ nullable: true }) operatorName!: string | null;
}

export class OrderPrintRecordItemSwagger {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['success', 'failed'] }) result!: string;
  @ApiProperty({ nullable: true }) failureReason!: string | null;
  @ApiProperty() printedAt!: string;
  @ApiProperty({ nullable: true }) operatorId!: string | null;
  @ApiProperty({ nullable: true }) operatorName!: string | null;
  @ApiProperty({ nullable: true }) requestId!: string | null;
  @ApiProperty({ nullable: true }) remark!: string | null;
}

export class OrderPrintRecordsSummarySwagger {
  @ApiProperty() successCount!: number;
  @ApiProperty() failedCount!: number;
  @ApiProperty({ nullable: true }) lastPrintedAt!: string | null;
  @ApiProperty({ nullable: true }) lastFailedAt!: string | null;
}

export class OrderPrintRecordsResponseSwagger {
  @ApiProperty({ type: [OrderPrintRecordItemSwagger] }) list!: OrderPrintRecordItemSwagger[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty({ type: OrderPrintRecordsSummarySwagger }) summary!: OrderPrintRecordsSummarySwagger;
}
```

在 `order.controller.ts` 对应 endpoint 加上 `@ApiOkResponse({ type: XxxSwagger })`。

---

## Step 11：清理测试文件

文件：`apps/api/test/regression/runner.js`

找到以下行并替换：

```javascript
// 旧（删除）
await prisma.printRecordBatch.deleteMany({ where: { tenantId: FIXTURES.tenantId } });

// 新（替换）
await prisma.orderPrintRecord.deleteMany({ where: { tenantId: FIXTURES.tenantId } });
```

---

## Step 12：同步配套文档

### 12-A `docs/prisma/data-model-reference.md`

- 删除 `print_record_batches` 表的描述段落
- 新增 `order_print_records` 表描述（字段说明、主键策略、索引说明、写入规则 append-only）
- 更新 `orders` 表，补充三个新列

### 12-B `docs/enums/enum-manual.md`

新增 `PrintRecordResultEnum` 条目，格式参考文件现有风格：

```
| 枚举名 | 值 | 含义 |
|--------|-----|------|
| PrintRecordResultEnum.SUCCESS | 'success' | 打印成功 |
| PrintRecordResultEnum.FAILED  | 'failed'  | 打印失败 |
```

---

## 验收检查清单

执行完毕后，逐项确认：

```
Schema & Migration
□ schema.prisma 中无 PrintRecordBatch / printRecordBatch 任何引用
□ schema.prisma 中 OrderPrintRecord 模型完整存在，4 条索引齐全
□ Order 模型含 lastPrintedAt / printFailedCount / lastFailedAt 三列
□ migration SQL 已生成，包含 CREATE + DROP + ALTER 语句
□ pnpm prisma generate 执行无报错

类型层
□ PrintRecordResultEnum 可从 @shou/types/enums 导入
□ TenantOrderItem 含新三字段
□ 新增 5 组接口（Request/Response/Query）可从 @shou/types/contracts 导入

业务代码
□ order-finance.service.ts 行数 ≤ 400，不含任何 printRecordBatch 引用
□ order-print.service.ts 存在，含 4 个 public 方法
□ order.controller.ts 含 5 个打印相关 endpoint（含原有 POST /print-records）
□ GET /print-records 路由声明在 GET /:id/print-records 之前
□ order.module.ts 已注册 OrderPrintService

后向兼容
□ POST /orders/print-records 契约（请求/响应字段）与改动前完全一致
□ orders 响应新增三字段，旧字段无改动

清理
□ apps/api/test/regression/runner.js 使用 orderPrintRecord.deleteMany
□ id-generator.constants.ts 无 PRINT_RECORD 条目，含 ORDER_PRINT 条目

文档
□ docs/prisma/data-model-reference.md 已同步
□ docs/enums/enum-manual.md 已添加 PrintRecordResultEnum
□ docs/api/tenant-api-doc.md 已在上一轮更新（无需再动）
```

---

## 注意事项

1. **文件行数限制**（来自 AGENTS.md §5）
   - 任何 `*.service.ts` ≤ 400 行，其他 `.ts` ≤ 500 行
   - 新建的 `order-print.service.ts` 预估 ~160 行，满足要求
   - 删除 `createPrintRecord` 后的 `order-finance.service.ts` 预估 ~280 行，满足要求

2. **多租户隔离**（来自 AGENTS.md §5）
   - 所有查询必须带 `tenantId` 条件，无例外

3. **append-only 约束**
   - `order_print_records` 表**永远不执行 UPDATE**，只有 INSERT 和级联 DELETE

4. **幂等安全**
   - 成功端点：requestId 仅写在 `orderIds[0]` 对应行，唯一索引 `(tenantId, requestId)` 防重
   - 失败端点：requestId 直接写当条行，同索引防重

5. **事件时间**
   - `printedAt` 由服务端 `new Date()` 生成，前端不参与；对齐 API 文档约定
