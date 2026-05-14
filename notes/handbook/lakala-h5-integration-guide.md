# 拉卡拉 H5 聚合支付接入手册

> 更新时间：2026-04-28
> 文档范围：只聚焦拉卡拉 H5 聚合收银台

## 一、 当前接入结论

当前项目已经完成 **拉卡拉 H5 聚合支付主链路联调**，并且是按真实公网回调闭环验证通过的。

本次已真实验证成功的链路：

- H5 调我方 `POST /api/pay/:token/initiate`
- 我方后端调用拉卡拉聚合收银台建单接口
- 拉卡拉返回 `resp_data.counter_url`
- 前端跳转拉卡拉聚合收银台
- 用户真实完成 `0.01` 元支付
- 拉卡拉回调我方 `POST /api/payment/webhook/lakala`
- 我方完成验签、金额校验、幂等入账
- 订单状态更新为 `paid`
- H5 `GET /api/pay/:token/status` 返回已支付

本次最终跑通的真实记录：

- 业务订单号：`ORDT1777266834601`
- 支付单：`PO20260428000005`
- 支付流水：`PAY20260428000001`
- 商户单号：`lkl17773569043399ac97737`
- 入账成功时间：`2026-04-28 14:20:10`

当前项目内的关键实现位置：

- H5 发起支付：[apps/api/src/payment/payment-operation.service.ts](../../../apps/api/src/payment/payment-operation.service.ts)
- 拉卡拉签名与验签：[apps/api/src/payment/gateway/lakala.adapter.ts](../../../apps/api/src/payment/gateway/lakala.adapter.ts)
- 拉卡拉回调控制器：[apps/api/src/payment/payment-webhook.controller.ts](../../../apps/api/src/payment/payment-webhook.controller.ts)
- 拉卡拉回调消费：[apps/api/src/payment/payment-webhook.service.ts](../../../apps/api/src/payment/payment-webhook.service.ts)

## 二、 官方文档入口

与当前 H5 聚合支付直接相关的官方文档：

- 开放平台安全接入规范：<https://i.lakala.com/doc/openapi/index.html>
- 聚合收银台订单创建：<https://o.lakala.com/#/home/document/detail?id=283>
- 聚合收银台订单查询：<https://o.lakala.com/#/home/document/detail?id=284>
- 聚合收银台订单通知：<https://o.lakala.com/#/home/document/detail?id=285>

其中当前项目直接使用的是：

- 建单接口：`POST /api/v3/ccss/counter/order/special_create`
- 建单成功返回字段：`resp_data.counter_url`

## 三、 当前真实链路

```text
H5 页面
  -> POST /api/pay/:token/initiate
  -> 我方后端创建本地 payment_order
  -> 我方后端调用拉卡拉 /api/v3/ccss/counter/order/special_create
  -> 拉卡拉返回 counter_url
  -> 前端跳转 counter_url
  -> 用户在拉卡拉聚合收银台自行选择微信或支付宝
  -> 拉卡拉异步回调我方 /api/payment/webhook/lakala
  -> 我方验签 校验金额 幂等入账
  -> H5 轮询 /api/pay/:token/status 获取最终状态
```

关键结论：

- 去聚合收银台之前，我方后端已经先完成建单
- 用户看到的支付页不是我方页面，而是拉卡拉返回的 `counter_url`
- 当前链路不会再通过 `account_type=ALIPAY` 把用户强制带到单一支付渠道
- 当前 H5 不需要额外新做拉卡拉页面，只要跳转 `cashierUrl`

### 1. 预下单成功和支付闭环成功的区别

- 打开了拉卡拉收银台，只代表预下单成功
- 收到拉卡拉回调并成功入账，才代表支付闭环成功

可以按下面理解：

```text
[点击支付]
    |
    v
[我方后端建单]
使用:
- LAKALA_APP_ID
- LAKALA_SERIAL_NO
- LAKALA_PRIVATE_KEY
    |
    v
[拉卡拉返回 counter_url]
    |
    v
[用户付款]
    |
    v
[拉卡拉回调我方 webhook]
    |
    v
[我方验签]
使用:
- LAKALA_PLATFORM_PUBLIC_KEY
    |
    +----------------------+
    | 验签失败             | 验签成功
    v                      v
[拒绝入账]           [金额校验 幂等入账 更新订单为 paid]
```

## 四、 最小必需参数

当前项目已经收敛成最小可跑配置，只保留以下 6 个平台级环境变量：

- `LAKALA_BASE_URL`
- `LAKALA_APP_ID`
- `LAKALA_SERIAL_NO`
- `LAKALA_PRIVATE_KEY`
- `LAKALA_PLATFORM_PUBLIC_KEY`
- `LAKALA_NOTIFY_URL`

### 各字段职责

- `LAKALA_BASE_URL`
  拉卡拉网关基础地址
  代码会自动拼上 `/api/v3/ccss/counter/order/special_create`
  模板默认值是 `https://api.lakala.com`
  本次真实跑通时实际使用的是 `https://s2.lakala.com`

- `LAKALA_APP_ID`
  拉卡拉开放平台应用身份
  用于生成 `Authorization` 请求签名

- `LAKALA_SERIAL_NO`
  商户签名证书序列号
  用于生成 `Authorization` 请求签名

- `LAKALA_PRIVATE_KEY`
  商户私钥
  用于请求签名

- `LAKALA_PLATFORM_PUBLIC_KEY`
  拉卡拉平台公钥
  用于验签拉卡拉回调

- `LAKALA_NOTIFY_URL`
  拉卡拉异步通知地址
  必须是拉卡拉能访问到的公网地址

租户级拉卡拉商户参数不再放在环境变量中，统一存储在 `tenant_payment_configs.configJson`

- `merchantNo`
  拉卡拉商户号
  预下单时映射为拉卡拉请求报文中的 `merchant_no`

- `terminalNo`
  拉卡拉终端号
  当前 H5 聚合收银台主链路不下发 `term_no`，保留为租户渠道配置字段

### 说明：

- `term_no` 不是当前这条最小 H5 主链路的必需项
- `vpos_id` 在文档里是非必填，当前实测不传也能成功建单
- 当前代码仍然固定传 `support_repeat_pay=1`
- 当前代码仍然固定把订单有效期设置为 `5` 分钟

## 五、 预下单

当前项目对拉卡拉聚合收银台发送的核心报文口径如下：

```json
{
  "req_time": "20260428141504",
  "version": "3.0",
  "req_data": {
    "merchant_no": "商户号",
    "out_order_no": "我方商户单号",
    "total_amount": 1,
    "order_efficient_time": "20260428142004",
    "notify_url": "https://api.dev.shoudanba.cn/api/payment/webhook/lakala",
    "support_repeat_pay": 1,
    "order_info": "{\"order_id\":\"ORD...\",\"subject\":\"订单支付-ORD...\"}"
  }
}
```

说明：

- `total_amount` 单位是分
- `out_order_no` 是我方生成的唯一商户单号，也是本地 `gatewayTradeNo`
- `order_info` 当前只承载最小订单标识与标题
- 当前没有传 `account_type=ALIPAY`
- 当前没有传旧 `preorder` 里的 `trans_type`
- 当前没有传 `term_no`
- 当前没有传 `vpos_id`

## 六、 当前回调处理口径

当前回调地址：

- `POST /api/payment/webhook/lakala`

当前代码的真实处理方式：

- webhook 路由在 [apps/api/src/main.ts](../../../apps/api/src/main.ts) 里按原始字节流接收
- controller 兼容 `application/json` 和 `application/x-www-form-urlencoded`
- 验签使用 `Authorization` 头和 `rawBody`
- 验签通过后再做金额校验和幂等入账

### 1. 当前真实回调中已验证出现的字段

本次真实成功回调里，实际收到过这些关键字段：

- 根级字段
  - `out_order_no`
  - `pay_order_no`
  - `total_amount`
  - `order_status`
  - `order_info`

- `order_trade_info` 嵌套字段
  - `trade_status`
  - `trade_time`
  - `trade_amount`
  - `payer_amount`
  - `log_no`
  - `trade_no`
  - `pay_mode`

### 2. 当前代码如何消费这些字段

- 用 `out_order_no` 定位本地 `payment_order`
- 用 `total_amount` 或 `order_trade_info.trade_amount` 做金额校验
- 用 `order_trade_info.trade_status` 判断是否支付成功
- 用 `order_trade_info.trade_time` 作为支付时间
- 用 `gatewayTradeNo` 做幂等收口

### 3. 当前成功入账的判定条件

- 验签通过
- 能定位到本地支付单
- 回调金额和本地支付单金额一致
- 支付状态是成功
- 本地尚未存在相同 `gatewayTradeNo` 的支付流水
