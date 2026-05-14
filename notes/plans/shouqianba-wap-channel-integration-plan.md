# 收钱吧 WAP 支付渠道改造清单

> 更新时间：2026-05-07
> 文档范围：基于当前已接好拉卡拉的项目，新增收钱吧 H5 WAP 直跳支付渠道
> 当前决策：不接 `precreate`，优先落地 `WAP` 直跳

## 一、 目标与结论

当前项目已经具备一套可复用的在线支付主链路：

- H5 调 `POST /api/pay/:token/initiate`
- 后端创建本地 `payment_order`
- 后端返回支付入口 URL
- 前端跳转第三方支付页
- 第三方回调我方 `notify_url`
- 我方完成验签、金额校验、幂等入账
- 写入 `payments`
- 写入 `payment_webhook_events`

新增收钱吧时，不需要复制一套新的支付业务 service。正确方向是：

- 保留当前支付主流程
- 新增 `SHOUQIANBA` 通道
- 新增收钱吧 provider / adapter / webhook normalizer
- 复用当前入账与落库主链路

当前阶段的推荐实现是：

- 不接收钱吧 `precreate`
- 直接使用收钱吧 `WAP` 跳转支付
- 继续沿用当前 `cashierUrl` 响应字段

这里的 `cashierUrl` 在收钱吧场景下，不代表“聚合收银台选择页”，而代表“前端下一跳支付入口 URL”。

## 二、 为什么选 WAP 直跳

相对 `precreate`，当前项目接收钱吧 `WAP` 直跳更合适，原因如下：

- 更贴合当前项目“后端返回 URL，前端跳转”的既有模型
- 不需要额外引入远程预下单调用
- 改动集中在 provider、签名、回调验签，不会推翻现有主链路
- 前端几乎可以沿用当前拉卡拉跳转行为
- 接口契约里的 `cashierUrl` 可以直接复用

当前不选 `precreate` 的边界也要明确：

- 当前阶段不追求“后端先向收钱吧确认建单成功”
- 当前阶段不追求二维码、小程序、App 支付等多入口形态统一
- 当前阶段不追求收钱吧专属的用户自主选微信/支付宝页面

## 三、 当前项目的真实扩展基础

当前代码已经具备多网关骨架，但还没有完全多通道化。

### 1. 已存在的基础能力

- `apps/api/src/payment/gateway/payment-gateway.types.ts`
  已抽出 `PaymentGatewayProvider`
- `apps/api/src/payment/gateway/payment-gateway.registry.ts`
  已有 provider 注册中心
- `apps/api/src/payment/payment-webhook.service.ts`
  已形成“验签归一后走统一入账”的处理模式
- `packages/types/src/contracts/payment.ts`
  `InitiatePaymentResponse` 已使用通用 `cashierUrl`

### 2. 当前还写死拉卡拉的位置

- `apps/api/src/payment/payment-initiation.service.ts`
  当前仍直接 `getProvider(LAKALA)`
- `apps/api/src/payment/payment-webhook.controller.ts`
  当前只有 `POST /payment/webhook/lakala`
- `apps/api/src/main.ts`
  当前只给 `/api/payment/webhook/lakala` 单独挂了 `raw` body 中间件
- `apps/api/prisma/schema.prisma`
  当前 `PaymentChannelEnum` 只有 `LAKALA`
- `packages/types/src/enums/payment.ts`
  当前共享支付通道闭集只有 `lakala`

结论：

- 主链路不需要推翻
- 但支付通道枚举、provider 注册、发起支付入口、webhook 路由，还没有真正放开成多渠道

## 四、 本期改造边界

### 1. 本期必须完成

- 新增 `SHOUQIANBA` 支付通道
- 收钱吧 WAP 直跳签名与 URL 生成
- 收钱吧异步回调接入
- 收钱吧回调验签
- 复用现有金额校验、幂等入账、订单实收累计、Webhook 审计落库
- 完成一笔真实支付闭环验证

### 2. 本期明确不做

- 不接 `precreate`
- 不接收钱吧查单接口
- 不接退款
- 不做“二维码 + WAP + 小程序”统一支付入口模型升级
- 不立即改 H5 页面做“微信 / 支付宝”显式二选一
- 不在本期引入租户级复杂支付路由配置中心

### 3. 建议后续补做

- `queryOrder` 能力
- 用户自主选择 `payway`
- 租户默认支付通道配置
- 多渠道 webhook 控制器进一步抽薄
- 收钱吧签名与验签单元测试

## 五、 收钱吧 WAP 直跳所需材料

当前项目按最小闭环落地，建议先收敛到以下配置：

- `SHOUQIANBA_GATEWAY_URL`
  收钱吧 WAP 网关地址
  建议默认 `https://qr.shouqianba.com/gateway`

- `SHOUQIANBA_TERMINAL_SN`
  终端号

- `SHOUQIANBA_TERMINAL_KEY`
  终端密钥
  用于生成请求签名

- `SHOUQIANBA_NOTIFY_URL`
  异步通知地址
  必须是收钱吧可访问的公网地址

- `SHOUQIANBA_PLATFORM_PUBLIC_KEY`
  收钱吧平台公钥
  用于校验回调签名

建议保留但不强制的配置：

- `SHOUQIANBA_RETURN_URL`
  支付完成后跳回的前端地址

- `SHOUQIANBA_DEFAULT_PAYWAY`
  默认支付方式
  当前阶段建议允许为空

说明：

- 当前方案不需要 `APP_ID`
- 当前方案不需要商户私钥 / 商户公钥证书体系
- 当前方案的主动请求签名与回调验签是两套机制

## 六、 最小改造清单

以下按章节施工，适合后续拆成 `T01` 到 `T06` 分步实现。

### T01 支付通道枚举与配置扩展

目标：

- 在不影响拉卡拉现有链路的前提下，为收钱吧增加最小配置入口

需要改的文件：

- `apps/api/prisma/schema.prisma`
- `packages/types/src/enums/payment.ts`
- `apps/api/src/config/payment.config.ts`
- `apps/api/src/config/env.validation.ts`
- `apps/api/.env.example`
- 如当前环境文件由仓库维护，则同步对应 `.env`

具体动作：

- 给 `PaymentChannelEnum` 增加 `SHOUQIANBA @map("shouqianba")`
- 给共享 `PaymentChannelEnum` 增加 `SHOUQIANBA: 'shouqianba'`
- 在 `payment.config.ts` 中新增收钱吧配置读取
- 在 `env.validation.ts` 中新增“只要启用收钱吧配置，就要求关键字段齐全”的校验
- 在 `.env.example` 中加入最小变量清单与中文注释

完成标准：

- 不配置收钱吧时，现有拉卡拉不受影响
- 配置收钱吧但关键字段缺失时，启动阶段直接失败

### T02 新增收钱吧网关 provider 与 adapter

目标：

- 让收钱吧接入方式落在 provider 层，不污染支付主业务 service

建议新增文件：

- `apps/api/src/payment/gateway/shouqianba.adapter.ts`
- `apps/api/src/payment/gateway/shouqianba-gateway.provider.ts`
- `apps/api/src/payment/gateway/shouqianba-webhook.normalizer.ts`

具体动作：

- 在 adapter 内封装：
  - WAP 参数组装
  - 请求签名生成
  - 跳转 URL 拼装
  - 回调签名验签
  - 金额解析
  - 时间解析
  - 收钱吧状态到平台内部状态的映射
- 在 provider 内实现：
  - `channel`
  - `generateTradeNo()`
  - `createCounterPayment()`
  - `verifyAndNormalizeWebhook()`

设计要求：

- `createCounterPayment()` 不发远程 `precreate`
- 直接本地生成跳转 URL 并返回
- `cashierUrl` 继续作为对外统一字段

完成标准：

- 收钱吧 provider 可以独立完成“生成跳转 URL”
- 不需要修改支付主领域规则

### T03 注册 provider 并放开发起支付入口

目标：

- 让当前发起支付逻辑可以根据通道动态选择 provider

需要改的文件：

- `apps/api/src/payment/gateway/payment-gateway.registry.ts`
- `apps/api/src/payment/payment.module.ts`
- `apps/api/src/payment/payment-initiation.service.ts`
- 如需要补 service 透传，则同步 `payment.service.ts` / `payment-operation.service.ts`

具体动作：

- 在 registry 中注册 `ShouqianbaGatewayProvider`
- 把当前 `prepareOnlinePaymentAttempt()` 里写死的 `LAKALA` 改成可配置或可选择的 channel

当前阶段推荐方案：

- 优先走“后端默认支付通道”模式
- H5 的 `POST /pay/:token/initiate` 请求体先不变
- 由后端按环境变量或固定配置决定当前使用 `lakala` 还是 `shouqianba`

不建议本期立刻做的事：

- 不要一上来改成 H5 必传 `channel`
- 不要一上来改成 H5 必传 `payway`

原因：

- 先把收钱吧真实支付闭环跑通更重要
- 当前 API 契约可以先保持稳定

完成标准：

- 相同的 H5 接口，在不同通道配置下可返回不同支付入口 URL

### T04 新增收钱吧 Webhook 路由与统一入账接入

目标：

- 让收钱吧回调也进入当前统一的验签、金额校验、幂等入账、审计落库主链路

需要改的文件：

- `apps/api/src/main.ts`
- `apps/api/src/payment/payment-webhook.controller.ts`
- `apps/api/src/payment/payment-webhook.service.ts`
- `apps/api/src/payment/payment.service.ts`

具体动作：

- 在 `main.ts` 中为 `/api/payment/webhook/shouqianba` 单独挂 `raw({ type: '*/*' })`
- 在 controller 中新增 `POST /payment/webhook/shouqianba`
- 读取原始报文和必要头部信息
- 调用收钱吧 provider 的 `verifyAndNormalizeWebhook()`
- 复用现有 payment order 定位、金额校验、幂等入账、订单实收累计、审计事件更新

建议实现策略：

- 本期可以先新增 `handleShouqianbaWebhook()`
- 等两个通道都稳定后，再考虑抽成 `handleGatewayWebhook(channel, request, context)`

完成标准：

- 收钱吧支付成功后，能够写入：
  - `payments`
  - `payment_webhook_events`
  - `orders.paid`
  - `payment_orders` 最终状态

### T05 H5 侧策略

目标：

- 在不大改前端的前提下完成收钱吧接入

当前阶段建议：

- H5 页面不增加新 UI
- 继续调用 `POST /api/pay/:token/initiate`
- 继续拿 `cashierUrl` 跳转

当前不做前端支付方式选择页的原因：

- 收钱吧没有像拉卡拉那样天然的聚合收银台选择页
- 若要让用户自己选微信或支付宝，应由我方 H5 自己做选择交互
- 该需求和“先把收钱吧 WAP 跳通”不是同一优先级

后续若要扩展：

- H5 增加“微信支付 / 支付宝支付”按钮
- 后端允许接收显式 `payway`
- provider 生成不同跳转参数

### T06 文档与联调验证

目标：

- 在事实源、共享类型、代码实现和真实联调结果之间保持一致

需要同步的文档：

- `docs/api/h5-api-doc.md`
- `notes/plans/lakala-h5-integration-guide.md`
- 本文档

建议补充的说明：

- `cashierUrl` 语义从“拉卡拉收银台地址”提升为“支付跳转入口 URL”
- H5 发起支付不再只绑定拉卡拉
- Webhook 路由扩展为多支付通道

真实联调验收标准：

- 使用真实收钱吧参数发起 1 笔 `0.01` 元支付
- H5 能成功跳转到收钱吧 WAP 支付入口
- 支付完成后，收钱吧能成功回调公网 `notify_url`
- 我方验签通过
- `payments` 成功写入
- `payment_webhook_events` 成功保存原始报文与归一化结果
- 订单状态和实收金额更新正确
- `/api/pay/:token/status` 返回 `paid`

## 七、 施工顺序建议

推荐按下面顺序推进：

1. `T01` 枚举与配置
2. `T02` 收钱吧 adapter / provider
3. `T03` 放开发起支付入口
4. `T04` 接收钱吧 webhook
5. `T06` 真实联调验证
6. 最后再决定是否进入 `T05` 的前端支付方式选择增强

原因：

- 不先把真实支付闭环跑通，前端选择页没有意义
- WAP 直跳方案本身就适合最小落地
- 当前阶段先把“能支付、能回调、能入账”做稳

## 八、 当前阶段的主要风险

### 1. WAP 直跳没有远程预下单确认

影响：

- 后端生成 URL 时，不会像拉卡拉那样先得到第三方“建单成功响应”
- 部分配置错误可能要到用户点击跳转后才暴露

应对：

- 启动期做严格 env 校验
- 对签名参数、金额参数、跳转 URL 生成增加单测或最小 smoke 验证

### 2. 收钱吧不是聚合收银台选择页

影响：

- 若业务需要让用户自主选微信或支付宝，需要我方 H5 自己做交互

应对：

- 本期不做
- 待主链路跑通后，再加显式 `payway` 选择

### 3. 回调格式与拉卡拉不同

影响：

- 需要单独做 normalizer
- 不应把收钱吧字段判断散落在主业务 service 内

应对：

- 所有第三方差异都收敛到 provider / adapter / normalizer

### 4. 后续若要多租户并存多通道，当前入口策略仍需升级

影响：

- 目前最小方案更偏“单通道切换”而非“同租户可自由选通道”

应对：

- 当前先通过默认通道切换完成接入
- 后续再考虑租户配置中心或 H5 显式传 `channel`

## 九、 下一阶段的直接施工指令

如果按最小可跑版本开工，建议先落以下子任务：

### T01

- 扩 `PaymentChannelEnum`
- 扩 `payment.config.ts`
- 扩 `env.validation.ts`
- 扩 `.env.example`

### T02

- 新建 `shouqianba.adapter.ts`
- 新建 `shouqianba-gateway.provider.ts`
- 新建 `shouqianba-webhook.normalizer.ts`
- 在 registry 与 module 中注册 provider

### T03

- 把 `payment-initiation.service.ts` 从写死 `LAKALA` 改为默认可切换通道
- 保持 H5 接口契约不变

### T04

- 增加 `/api/payment/webhook/shouqianba`
- 接入验签
- 跑真实支付闭环

完成以上 4 步后，再决定是否进入：

- H5 自主选支付方式
- 查询接口
- 退款接口
- 更通用的多渠道支付入口抽象

## 十、 官方文档入口

当前方案直接相关的收钱吧官方文档：

- WAP 跳转支付
  <https://doc.shouqianba.com/zh-cn/api/wap2.html>

- 请求签名
  <https://doc.shouqianba.com/zh-cn/api/sign.html>

- 异步通知
  <https://doc.shouqianba.com/zh-cn/api/interface/notify.html>

- 回调验签
  <https://doc.shouqianba.com/zh-cn/api/verifysignature.html>

补充说明：

- 当前方案明确不使用 `precreate`
- 若后续改为收钱吧预下单模式，再补充 `precreate` 文档与对应代码抽象即可
