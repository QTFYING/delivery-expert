# Tenant 消息中心与账期通知实施方案

> 日期：2026-06-03
> 文档状态：方案讨论稿
> 文档定位：`notes` 非事实源，用于后续拆分实施；正式接口语义以后续 `docs/api`、`packages/types`、Swagger 为准

## 一、背景

当前 Tenant 端已有 `/notifications` 通知入口，但现有 `notices / notice_reads` 模型表达的是 Admin 发布的平台公告。

账期到期提醒属于系统生成的租户业务消息，不应直接混入平台公告模型，否则会混淆公告发布方、业务消息生成方和阅读状态语义。

本方案建设 Tenant 消息中心，统一承载租户侧站内信。首版仅支持账期通知，后续可扩展日报、支付、系统任务等其它消息类型。

## 二、核心结论

1. `notices / notice_reads` 继续表示平台公告
2. 新增业务消息模型承载系统生成的租户消息
3. 首版只实现账期通知，消息按租户、日期、账期类型聚合
4. 消息阅读状态按用户维度维护
5. 重复标记已读时保留首次 `readAt`，不覆盖
6. 前端公开契约只用 `type` 区分通知类型，不额外提供 `kind`

账期消息示例：

```ts
{
  type: 'credit',
  title: '月结账单',
  subtitle: '你有 5 笔月结订单，总计 3000 元，注意查收',
  status: 'unread',
  orders: ['ORD1', 'ORD2', 'ORD3', 'ORD4', 'ORD5'],
  readAt: null
}
```

## 三、目标与非目标

### 3.1 目标

- 建立 Tenant 消息中心的模型边界
- 支持平台公告与业务消息统一出现在 `/notifications`
- 支持账期通知每日自动生成
- 支持按用户维护已读状态
- 支持前端通过账期消息中的 `orders` 展示对应订单集合

### 3.2 非目标

- 本次不处理 `creditRemindDays` 命名统一
- 首版不支持日报、支付通知、系统任务等其它消息类型
- 首版不按单笔订单生成账期消息
- 首版不把消息 `status` 作为订单处理状态
- 首版不新增 `/settings/credit-rules`

## 四、模型设计

### 4.1 平台公告

现有模型保持不变：

```text
notices
notice_reads
```

语义：

- `notices` 表示 Admin 发布的平台公告
- `notice_reads` 表示当前 Tenant 用户对公告的阅读状态

### 4.2 业务消息

新增租户业务消息模型：

```text
tenant_messages
tenant_message_reads
```

`tenant_messages` 建议字段：

```text
id
tenantId
type
title
subtitle
payloadJson
businessDate
createdAt
updatedAt
```

`tenant_message_reads` 建议字段：

```text
messageId
tenantId
userId
readAt
```

建议约束：

```text
tenant_messages: unique(tenantId, type, businessDate, payloadJson.creditType)
tenant_message_reads: primary key(messageId, tenantId, userId)
```

说明：

- `tenant_messages` 是租户级消息主体
- `tenant_message_reads` 是用户级阅读状态
- `status` 不落库，由当前用户的 `readAt` 派生
- `payloadJson` 是黑盒 JSON，服务端只约束当前消息类型需要的最小结构

## 五、通知类型与契约

前端公开契约只保留一个 `type` 字段：

```ts
type TenantNotificationType = 'platform_notice' | 'credit';
type TenantMessageReadStatus = 'unread' | 'read';
```

统一通知列表项建议结构：

```ts
interface TenantNotificationRecordItem {
  id: string;
  type: 'platform_notice' | 'credit';
  title: string;
  subtitle?: string;
  content?: string;
  status: 'unread' | 'read';
  orders?: string[];
  readAt: string | null;
  createdAt: string;
}
```

字段语义：

- `type='platform_notice'`：平台公告
- `type='credit'`：账期通知
- `status`：当前用户对该通知的阅读状态
- `readAt`：当前用户首次阅读时间
- `orders`：账期通知关联的订单 ID 数组

后端可按 ID 前缀或内部查表来源区分公告与业务消息，不要求前端关心来源表。

## 六、接口设计

### 6.1 获取消息中心列表

- **GET** `/notifications`
- **权限**：`notifications.read`
- **响应**：`PaginatedResponse<TenantNotificationRecordItem>`

业务规则：

- 返回平台公告与业务消息的统一收件箱列表
- 只返回当前租户可见内容
- `status / readAt` 按当前登录用户计算
- 平台公告与业务消息按发布时间或创建时间倒序合并分页

### 6.2 标记已读

- **POST** `/notifications/{id}/read-records`
- **权限**：`notifications.manage`
- **响应**：`null`

业务规则：

- 只能维护当前登录用户自己的阅读状态
- 只能标记当前租户可见的通知
- 当前用户无阅读记录时创建阅读记录
- 已存在阅读记录时不覆盖首次 `readAt`
- 标记平台公告不改变公告发布、下架或可见范围
- 标记业务消息不改变消息主体和订单状态

## 七、账期通知生成

### 7.1 Worker

新增独立账期提醒 worker：

- 不放在 API 进程
- 不混入 import-worker
- 默认每日 `08:00 Asia/Shanghai` 执行
- 多实例部署时通过 Redis lock 或数据库唯一约束保证幂等

### 7.2 扫描范围

只扫描符合以下条件的订单：

- `payType=credit`
- 未结清
- 未作废
- 未软删除
- 存在账期到期日

排除：

- 现款订单
- 滚结订单
- 已结清订单
- 已作废订单
- 软删除订单

### 7.3 聚合规则

按以下维度聚合生成消息：

```text
tenantId + businessDate + creditType
```

`creditType` 包含：

- `month`
- `week`
- `period`

消息文案示例：

```text
月结账单
你有 5 笔月结订单，总计 3000 元，注意查收
```

`payloadJson` 建议结构：

```ts
{
  orderIds: string[];
  creditType: 'month' | 'week' | 'period';
  totalAmount: number;
  orderCount: number;
}
```

说明：

- `orders` 对外由 `payloadJson.orderIds` 投影
- 订单是否已收款、部分收款、作废等以订单实时状态为准
- 消息本身只表达提醒快照，不表达订单处理完成状态

## 八、接收人与权限

账期通知的接收范围按权限判断：

- 当前租户
- 启用用户
- 拥有 `credit.read` 权限
- Owner 隐式全权限应命中

消息列表与已读接口仍使用通知权限：

- `notifications.read`
- `notifications.manage`

说明：

- `credit.read` 决定账期消息生成时哪些用户属于目标接收范围
- `notifications.read / notifications.manage` 决定用户是否能访问消息中心和维护阅读状态
- Tenant 侧不得依赖前端传入 `tenantId`

## 九、前端交互

消息中心展示聚合账期消息。

用户点击账期消息后，前端使用 `orders` 中的订单 ID 展示对应订单集合。订单集合可以通过订单域能力读取实时状态、金额、收款进度和作废状态。

交互边界：

- 消息 `status` 只表示当前用户是否读过
- 订单是否处理完成由订单实时状态判断
- 老板已读不影响财务未读状态
- 财务已读不影响老板未读状态

## 十、验证场景

### 10.1 消息生成

- 月结、周结、普通账期分别生成聚合消息
- 现款和滚结不生成消息
- 已结清、已作废、软删除订单不生成消息
- 同一租户同一天同一账期类型重复执行不重复生成

### 10.2 阅读状态

- 老板已读不影响财务未读状态
- 重复标记已读不覆盖首次 `readAt`
- 跨租户不能读取或标记其他租户消息
- 无 `notifications.read` 不能读取消息中心
- 无 `notifications.manage` 不能标记已读

### 10.3 接口与契约

- `GET /notifications` 可同时返回平台公告和账期消息
- `type / status / readAt / orders` 与 contracts、Swagger 一致
- `POST /notifications/{id}/read-records` 对公告和业务消息都能正确处理
- `pnpm -F api build` 通过
- 新增消息中心和账期通知相关冒烟或回归测试

## 十一、实施顺序建议

1. 更新 `docs/api/tenant-api-doc.md` 的通知接收语义
2. 更新 `packages/types` 枚举与 contracts
3. 更新 Prisma schema 与 `docs/prisma/data-model-reference.md`
4. 新增迁移 SQL
5. 改造 `NotificationModule` 为统一消息中心
6. 新增账期提醒 worker
7. 补充构建、冒烟与回归测试

每一步都应保持租户隔离、阅读状态用户隔离和账期消息幂等生成。
