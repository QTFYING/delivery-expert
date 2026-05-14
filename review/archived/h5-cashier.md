# H5 收银台返回后的支付动作改造计划（2026-05-06）

## 背景

当前 H5 在线支付链路中，用户点击“去支付”后，后端会创建拉卡拉收银台支付尝试，并将 H5 收款状态推进到 `paying`。如果用户在拉卡拉聚合支付页面直接按浏览器返回键回到 H5，后端只能确认“已有一笔支付尝试等待网关回调”，不能确认用户主动取消，也不能确认用户不会继续完成支付。

因此，不能简单把 `paying` 本地改回 `unpaid`，也不能在 `paying` 期间允许前端重新创建另一笔支付单。更合理的处理方式是：保留订单层面的 `paying` 状态，同时由服务端返回当前允许的支付动作。

目标响应形态：

```ts
{
  status: 'paying',
  statusMessage: '支付确认中',
  paymentAction: {
    canResume: true,
    resumeUrl: '...',
    canInitiate: false,
    expiresAt: '2026-05-06T12:35:00+08:00'
  }
}
```

## 设计原则

- 不新增 H5 订单收款状态，继续使用 `unpaid`、`paying`、`pending_verification`、`paid`、`expired`。
- 不向 H5 前端暴露 `payment_orders.id`，避免前端依赖内部支付尝试建模。
- `paymentAction` 只表达服务端裁决后的业务动作能力，不表达按钮文案、页面布局或具体 UI 指令。
- `paying` 期间如果当前拉卡拉收银台仍有效，只允许继续同一笔支付尝试，不允许创建并发支付单。
- 是否允许重新发起支付必须由后端裁决，前端不得根据倒计时、本地历史或浏览器返回行为自行判断。
- `/pay/:token/status` 必须返回新鲜状态，不允许浏览器或反向代理缓存。

## 服务端改造计划

### T01 契约与文档同步

涉及文件：

- `docs/api/h5-api-doc.md`
- `packages/types/src/contracts/payment.ts`
- `apps/api/src/payment/payment.swagger.ts`

新增共享结构：

```ts
export interface PaymentAction {
  /** 是否允许继续当前未过期的第三方收银台支付尝试 */
  canResume: boolean;
  /** 当前支付尝试的继续支付地址；不可继续时为 null */
  resumeUrl: string | null;
  /** 是否允许重新发起在线支付 */
  canInitiate: boolean;
  /** 当前支付尝试过期时间；无有效支付尝试时为 null */
  expiresAt: string | null;
}
```

建议在以下响应中增加 `paymentAction`：

- `PaymentOrderDetailResponse`
- `PaymentStatusResponse`
- 可选：`SubmitOfflinePaymentResponse`，如果前端提交线下登记后也需要统一刷新动作能力

### T02 数据模型补充

涉及文件：

- `apps/api/prisma/schema.prisma`
- `docs/prisma/data-model-reference.md`

给 `PaymentOrder` 增加：

```prisma
cashierUrl        String?   @db.Text
cashierExpiresAt DateTime?
```

说明：

- `cashierUrl` 保存拉卡拉返回的当前收银台跳转地址，用于用户返回 H5 后继续同一笔支付尝试。
- `cashierExpiresAt` 与拉卡拉建单参数 `order_efficient_time` 对齐。
- 当前拉卡拉收银台有效期为 5 分钟，后端不要只依赖 `lastInitiatedAt + 5min` 的隐式推导。

### T03 `/initiate` 改成恢复优先

涉及文件：

- `apps/api/src/payment/payment-initiation.service.ts`
- `apps/api/src/payment/payment.domain.ts`
- `apps/api/src/payment/mapping/payment.mapper.ts`

规则：

- 当前无支付尝试：创建新拉卡拉支付单，保存 `cashierUrl`、`cashierExpiresAt`，返回 `cashierUrl`。
- 当前最新支付尝试为未过期 `paying` 且有 `cashierUrl`：不创建新支付单，直接返回同一笔 `cashierUrl`。
- 当前最新支付尝试已过期：先将该支付尝试转为 `expired`，再允许创建新支付单。
- 当前订单已支付、已作废、待线下核销：继续按现有业务规则拒绝。

该调整的重点是让 `POST /pay/:token/initiate` 具备幂等恢复语义：用户误触返回后再次点击支付，不会产生第二笔并发支付单。

### T04 `/status` 与详情返回 `paymentAction`

涉及文件：

- `apps/api/src/payment/payment-query.service.ts`
- `apps/api/src/payment/payment-h5.controller.ts`

建议裁决规则：

```text
unpaid:
  canInitiate = true
  canResume = false
  resumeUrl = null
  expiresAt = null

paying + 未过期 + 有 cashierUrl:
  canInitiate = false
  canResume = true
  resumeUrl = cashierUrl
  expiresAt = cashierExpiresAt

paying + 已过期:
  后端先转 expired
  canInitiate = true
  canResume = false
  resumeUrl = null

expired + 上一笔支付尝试过期:
  canInitiate = true
  canResume = false

expired + 订单本身作废或不可支付:
  canInitiate = false
  canResume = false
```

注意：当前 `expired` 同时承载“上一笔支付尝试过期”和“订单作废/不可支付”两类语义。前端不应自行猜测，必须以 `paymentAction.canInitiate` 作为是否展示重新支付入口的依据。

### T05 `/status` 禁止缓存

涉及文件：

- `apps/api/src/payment/payment-h5.controller.ts`
- 或新增针对 H5 状态接口的轻量拦截器

`GET /pay/:token/status` 必须返回：

```http
Cache-Control: no-store
Pragma: no-cache
Expires: 0
```

目标：

- 消除状态轮询中的 304。
- 避免浏览器或反向代理复用旧的 `paying` 响应。

### T06 验证项

最小验证：

- `pnpm -F api build`
- 发起支付后返回 H5，`/status` 返回 `paying` 且 `paymentAction.canResume=true`。
- 未过期时重复调用 `/initiate` 不创建新的 `payment_orders`，直接返回原 `cashierUrl`。
- 超时后 `/status` 将最新支付尝试转为 `expired`，并返回 `paymentAction.canInitiate=true`。
- 拉卡拉成功回调后 `/status` 返回 `paid`，且不允许继续或重新发起支付。
- `/pay/:token/status` 返回 200 新鲜数据，不再出现 304。

## 前端收银台改进指南

### 1. 页面初始化

进入 H5 页面时调用订单详情接口，读取：

```ts
status;
statusMessage;
paymentAction;
```

不要只根据 `status` 决定按钮。按钮展示和可点击状态应结合 `paymentAction`。

### 2. 待支付状态

当：

```ts
status === 'unpaid';
paymentAction.canInitiate === true;
```

展示“去支付”。

点击后调用：

```http
POST /pay/:token/initiate
```

拿到 `cashierUrl` 后跳转拉卡拉收银台。

### 3. 支付中状态

当：

```ts
status === 'paying';
paymentAction.canResume === true;
```

建议展示：

- 支付结果确认中
- 继续支付
- 我已完成支付，刷新结果
- 稍后再说 / 联系商户

“继续支付”直接跳转：

```ts
window.location.href = paymentAction.resumeUrl;
```

这里是继续同一笔拉卡拉支付尝试，不是重新创建支付单。

### 4. 禁止并发重新支付

当：

```ts
paymentAction.canInitiate === false;
```

前端不要展示“重新支付”或“去支付”。

即使用户从拉卡拉收银台返回 H5，只要后端仍返回 `canInitiate=false`，前端就只能提供“继续支付”或“刷新结果”等动作。

### 5. 过期状态

当：

```ts
status === 'expired';
paymentAction.canInitiate === true;
```

建议文案：

```text
上次支付已超时，可重新发起支付。
```

按钮展示“重新支付”。

当：

```ts
status === 'expired';
paymentAction.canInitiate === false;
```

建议文案：

```text
订单已失效，请联系商户。
```

不要展示重新支付入口。

### 6. 轮询策略

建议：

- 前 30 秒：每 2 秒查询一次 `/status`。
- 30 秒到 2 分钟：每 5 秒查询一次 `/status`。
- 超过 2 分钟：停止自动轮询，展示手动刷新。
- 页面重新可见时，通过 `visibilitychange` 主动刷新一次状态。
- 请求 `/status` 时使用 `cache: 'no-store'`。

示例：

```ts
fetch(statusUrl, { cache: 'no-store' });
```

### 7. 前端不要做的事

- 不要本地把 `paying` 改成 `unpaid`。
- 不要在 `paying` 时重新创建支付单，除非后端返回 `paymentAction.canInitiate=true`。
- 不要根据浏览器返回行为判断用户取消支付。
- 不要根据本地倒计时自行判定支付最终过期，最终状态以服务端 `/status` 为准。
- 不要依赖 `payment_orders.id` 或拉卡拉内部单号驱动页面逻辑。

## 预期收益

- 用户误触返回后可以继续同一笔拉卡拉收银台支付。
- 前端不再被锁在单一“支付确认中”状态里。
- 后端不放开并发支付风险。
- `expired` 的前端交互由 `paymentAction.canInitiate` 裁决，不再靠页面猜测。
- `/status` 轮询不再被缓存干扰。
