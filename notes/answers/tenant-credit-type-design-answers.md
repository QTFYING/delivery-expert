# Tenant 账期类型改造答疑与服务端口径

> 目的：针对前端账期规则改造文档中的关键歧义，结合当前服务端业务现状，给出本期可落地的服务端设计口径。

## 1. creditType 命名：不用 account，建议用 period

当前 `orders.payType` 没有传值时默认 `cash`，这个口径保持不变。本次改造主要扩展 `payType=credit` 时的细分类型。

建议：

```ts
payType: 'cash' | 'credit'
creditType?: 'month' | 'week' | 'period' | null
```

含义：

| payType | creditType | 中文含义 |
| --- | --- | --- |
| cash | null | 现款 |
| credit | month | 月结 |
| credit | week | 周结 |
| credit | period | 账期 |

不建议使用 `account`。`account` 更容易被理解成账户、客户账、会计科目，不够贴近“账期结算”。

`period` 更贴近业务里的“账期 / payment period / credit period”，表达的是一个固定账期条件，比 `account` 更自然。

如果想更直白，也可以用 `standard`，但 `standard` 表达的是“标准类型”，不是“账期类型”本身。综合来看，本期建议使用：

```ts
CreditTypeEnum = {
  month: 'month',
  week: 'week',
  period: 'period',
}
```

## 2. creditType 默认为 null，以及历史数据如何处理

`creditType=null` 的含义不是“未知账期”，而是“没有账期子类型”。

明确规则：

```txt
payType=cash   => creditType 必须为 null
payType=credit => creditType 原则上必须有值
```

也就是说，`null` 是给现款订单用的，不是给账期订单长期使用的。

### 新订单处理

新建或导入订单时：

| 输入结算方式 | payType | creditType |
| --- | --- | --- |
| 空值 / 现款 / 现金 / cash | cash | null |
| 月结 | credit | month |
| 周结 | credit | week |
| 账期 / 赊账 / credit | credit | period |



### 历史数据迁移

当前历史订单只有 `payType`，没有 `creditType`。迁移时无法还原它到底是月结、周结还是普通账期，所以只能做保守归类：

```txt
payType=CASH
=> creditType=null

payType=CREDIT 且 creditType 为空
=> creditType=period
```

这里的意思是：历史 `credit` 订单默认视为“普通账期”，不是月结，也不是周结。

原因是：

- 月结 / 周结是本次新增语义，历史数据没有可靠证据反推。
- 把历史 credit 归为 `period` 最保守，不会误伤月结/周结筛选。
- 前端仍可在列表展示为“账期”。

## 3. 滚结：本期先归现款，但枚举留口子

本期业务口径建议：

```txt
滚结 => payType=cash, creditType=null
```

也就是滚结不进入账期管理，不生成账期待办，不参与 `payType=credit` 的筛选和统计。

如果要留未来口子，可以在设计文档里说明：

```txt
当前阶段滚结按现款处理；后续如需独立结算流程，可新增 creditType='scroll' 或独立 settlementType 重新承载。
```

但不建议现在把 `scroll` 放进正式枚举。

原因：

- 当前没有滚结的账期规则、到期日规则、提醒规则。
- 一旦把 `scroll` 放进 `creditType`，前端和报表就会自然认为它属于账期体系。
- 现在服务端没有足够业务规则支撑它。

所以本期最稳口径是：识别滚结，但标准化成现款。

## 4. 预检标准化输出里的 creditDueDate 是什么

`creditDueDate` 表示账期订单的“应收款到期日”。

它是服务端根据订单时间和账期天数计算出来的日期。

建议逻辑：

```txt
creditDueDate = orderTime + creditDays
```

示例：

```txt
orderTime = 2026-05-21 10:00:00
creditType = month
creditDays = 30
creditDueDate = 2026-06-20 10:00:00
```

对外契约可以叫 `dueDate`，数据库字段继续沿用当前已有的 `creditDueDate`。

本期建议：

```ts
// 内部数据库字段
creditDueDate: Date | null

// API 返回字段
dueDate?: string
```

不同 `creditType` 的默认天数：

```txt
month => 30
week  => 7
period    => 使用系统默认普通账期天数
```

如果当前还没有普通账期天数字段，本期可以先给服务端常量默认值，例如 30 天；后续再考虑是否纳入 `/settings/general`。

预检阶段输出这些字段的意义是：前端预检表格能展示服务端最终识别结果，正式导入也直接消费同一份快照，避免预检和正式导入两套逻辑不一致。

## 5. payType=credit 且未收款时 status=credit 的含义

当前服务端里 `status` 是订单状态，不是支付状态。

现有订单状态里已经有：

```ts
OrderStatusEnum = {
  PENDING: 'pending',
  PARTIAL: 'partial',
  PAID: 'paid',
  EXPIRED: 'expired',
  CREDIT: 'credit',
}
```

其中 `credit` 表示“账期单状态”，不是支付方式本身。

目前的状态推导逻辑大致是：

```txt
已作废 => expired
已收金额 >= 应收金额 => paid
已收金额 > 0 => partial
payType=credit => credit
否则 => pending
```

所以：

```txt
payType=credit 且未收款 => status=credit
```

意思是这张订单不是普通待收款，而是账期待收。

这里要注意命名上确实有一点混淆：

- `payType=credit` 是结算方式。
- `status=credit` 是订单当前处于账期待收状态。

短期不建议为了本次需求改订单状态模型，因为影响面会很大。只需要在文档里明确 `status=credit` 属于订单状态即可。

## 6. creditStatus 的设计初衷，以及为什么不建议落库

`creditStatus` 的初衷是给账期管理和首页待办展示“账期紧急程度”。

例如：

| creditStatus | 含义 |
| --- | --- |
| normal | 正常 |
| soon | 即将到期 |
| today | 今日到期 |
| overdue | 已逾期 |

它依赖两个东西：

```txt
creditDueDate
当前日期
```

如果引入租户设置，还会依赖：

```txt
creditRemindDays
```

不建议把 `creditStatus` 落库，原因是它会随时间自动变化。

例如：

```txt
2026-05-20 查询：soon
2026-05-21 查询：today
2026-05-22 查询：overdue
```

如果落库，就必须有定时任务每天刷新所有未结清账期订单，否则状态会过期。

当前服务端已经更接近正确做法：

```txt
持久化 creditDays / creditDueDate
查询时动态计算 creditStatus
```

所以本期建议吸收 `creditStatus` 这个 API 展示字段，但不吸收“创建或导入时写入 creditStatus”这个设计。

## 7. “批量重算历史订单”是什么意思，为什么不建议默认做

“批量重算历史订单”指的是：当用户修改账期规则后，服务端自动把已有未结清账期订单的账期天数和到期日全部重新计算一遍。

例如当前有一张历史订单：

```txt
orderTime = 2026-05-01
creditType = month
creditDays = 30
creditDueDate = 2026-05-31
```

用户后来把月结规则从 30 天改成 45 天。

如果自动批量重算，这张老订单会变成：

```txt
creditDays = 45
creditDueDate = 2026-06-15
```

这就是“批量重算历史订单”。

不建议默认做的原因：

- 老订单的账期条件可能是订单成立时双方已经确认的财务约定。
- 静默改变到期日，会影响财务催收、对账和历史报表。
- 用户改设置时，预期可能只是影响以后新订单，不一定希望改旧订单。

本期建议口径：

```txt
账期规则变更默认只影响新创建 / 新导入订单。
已存在订单不自动重算。
```

如果业务必须支持重算，建议以后做成显式动作：

```txt
保存设置后，前端明确询问：是否同步更新未结清、未作废账期订单？
```

服务端也应该记录审计日志，并且只允许重算：

```txt
payType=credit
status != paid
voided=false
deletedAt=null
```

不应该重算：

```txt
已结清订单
已作废订单
现款订单
已删除订单
```

## 本期建议最终口径

本期服务端吸收范围：

- 保持 `payType` 默认 `cash`。
- 新增 `creditType: month | week | period | null`。
- `creditType=null` 只表示非账期子类型，主要用于现款订单。
- 历史 `payType=credit` 且 `creditType` 为空的数据迁移为 `period`。
- 滚结本期识别为现款，不进入账期体系。
- 预检阶段输出标准化后的 `payType / creditType / creditDays / dueDate`。
- 正式导入直接消费预检快照。
- `creditStatus` 查询时动态计算，不落库。
- 账期规则变更默认不批量重算历史订单。

本期不吸收：

- 不新增 `/settings/credit-rules`。
- 不新增提醒时间配置。
- 不新增提醒渠道配置。
- 不把 `scroll` 放进正式 `creditType` 枚举。
- 不持久化 `creditStatus`。
