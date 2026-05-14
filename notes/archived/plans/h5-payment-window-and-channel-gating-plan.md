# H5 支付有效期与租户支付渠道门禁改造计划

> 日期：2026-05-08
> 文档状态：已完成，已归档
> 文档定位：非事实源施工清单
> 适用范围：`apps/api/src/payment`、`apps/api/src/settings`、`docs/api`、`../static/apps/h5`
> 事实源：`docs/api/h5-api-doc.md`、`docs/api/tenant-api-doc.md`、`docs/api/api-architecture-overview.md`、`packages/types/src/contracts/payment.ts`、`packages/types/src/contracts/settings.ts`、`apps/api/src/payment`、`apps/api/src/settings`

## 1. 稳定结论

本轮在既有“租户支付渠道配置”主线之上，新增 H5 支付有效期门禁能力，当前已确认结论如下：

1. 租户支付配置保持“多渠道配置 + 单一当前生效渠道”模型
2. P0 仍只开放 `lakala`，但 H5 不得再把“在线支付”写死成拉卡拉专属语义
3. `tenantGeneralSettings.qrCodeExpiry` 表示订单可支付有效期，单位为天
4. 当前采用方案 A：`qrCodeExpiry` 不做订单快照，按租户最新设置实时生效
5. 当前采用方案 B：订单超过支付有效期后，H5 页面仍可打开，但不可再发起任何支付动作
6. H5 页面是否允许支付，必须由后端统一裁决，前端不自行计算 `qrCodeExpiry`
7. `order.voided` 是订单硬终态，不因超过 `qrCodeExpiry` 被回写
8. 超过支付有效期后，页面应明确提示“订单已超过商户设置的支付有效期（XX天），请联系商户处理”

## 2. 总体设计

H5 收银台最终门禁由后端按以下顺序统一裁决：

1. `token` 无效、订单不存在或已删除
2. `order.voided=true`
3. 是否超过租户当前 `qrCodeExpiry`
4. 当前订单状态是否允许支付
5. `tenant.activePaymentChannel` 是否存在
6. 当前生效支付渠道配置状态是否为 `available`

语义分层如下：

1. `voided`
   - 订单硬失效
   - 页面与动作都按不可继续处理
2. `qrCodeExpiry`
   - H5 支付资格门禁
   - 页面可看，但支付动作全关
3. 支付渠道配置
   - 在线支付门禁
   - 不影响“页面可看”本身

## 3. 改造章节

### T05-1 后端补 H5 支付有效期裁决

目标：

- 在后端统一判断订单是否超过租户当前 `qrCodeExpiry`

建议范围：

- `apps/api/src/payment`
- 必要时从 `apps/api/src/settings` 读取租户通用配置

建议动作：

1. 新增一个收口函数或子 service，统一计算：
   - `orderTime`
   - `tenant.generalSettings.qrCodeExpiry`
   - `now`
   - 是否超过支付有效期
2. 统一生成超期提示文案，避免散落在多个 service 内拼接
3. 不写回 `order.voided`
4. 不新增订单快照字段

完成标准：

1. 后端存在单一的 `qrCodeExpiry` 裁决入口
2. 不在 H5 controller 或前端层重复判断

### T05-2 将有效期裁决接入 H5 查询与动作链路

目标：

- 让 H5 详情、状态、发起支付、线下登记都遵守支付有效期门禁

建议范围：

- `apps/api/src/payment/payment-query.service.ts`
- `apps/api/src/payment/payment-initiation.service.ts`
- `apps/api/src/payment/payment-operation.service.ts`

建议动作：

1. `GET /pay/:token`
   - 超过有效期时仍返回详情
   - 但强制：
     - `status=expired`
     - `paymentAction.canInitiate=false`
     - `paymentAction.canResume=false`
     - `statusMessage` 为超期提示
2. `GET /pay/:token/status`
   - 与详情保持同一套超期裁决
3. `POST /pay/:token/initiate`
   - 超过有效期时直接拒绝
4. `POST /pay/:token/offline-payment`
   - 超过有效期时也直接拒绝
5. 不因超期修改订单持久化状态

完成标准：

1. H5 页面可打开但不可支付的语义由后端稳定下发
2. 直接调 `initiate` 或 `offline-payment` 也无法绕过有效期门禁

### T05-3 同步 H5 API 事实源与门禁文案

目标：

- 让事实源文档明确本轮新增的 H5 支付有效期语义

建议范围：

- `docs/api/h5-api-doc.md`
- 必要时 `docs/api/tenant-api-doc.md`
- 必要时 `docs/api/api-architecture-overview.md`

建议动作：

1. 明确 `qrCodeExpiry` 当前按租户最新设置实时生效
2. 明确页面可打开但不可支付的 B 方案语义
3. 明确 `paymentAction.canInitiate` 现在同时受：
   - 订单状态
   - 支付有效期
   - 当前生效渠道配置状态
     三层规则影响
4. 若补错误码或文案差异，文档同步更新

完成标准：

1. 文档可直接指导 H5 前端联调
2. 没有把“支付有效期超期”和“渠道不可用”混成一个原因

### T05-4 H5 收银台按统一门禁语义改造

目标：

- 让 `../static/apps/h5` 正确消费后端新的支付有效期与渠道门禁语义

建议范围：

- `../static/apps/h5/src/pages/payment-cashier-page.tsx`
- `../static/apps/h5/src/features/payment/hooks/use-payment-actions.ts`
- `../static/apps/h5/src/features/payment/components/payment-method-sheet.tsx`
- `../static/apps/h5/src/features/payment/hooks/use-payment-status-polling.ts`

边界澄清：

1. 当前真实入口页是 `payment-cashier-page.tsx`
2. 旧 `payment-page.tsx` 暂不纳入本章范围，除非后续确认仍被真实路由引用
3. H5 前端只消费后端返回的 `status`、`paymentAction`、`statusMessage`
4. H5 前端不自行计算 `qrCodeExpiry`，也不推导“渠道是否可用”

建议拆分：

#### T05-4-1 页面状态与按钮裁决收口

目标：

- 让页面主视图严格以 `status`、`paymentAction`、`statusMessage` 为唯一门禁来源

建议范围：

- `../static/apps/h5/src/pages/payment-cashier-page.tsx`

建议动作：

1. 收敛 `canInitiateOnline`、`canResumeOnline`、`canSelectPaymentMethod` 的判断来源
2. 超过支付有效期时：
   - 页面可打开
   - 主按钮禁用，不隐藏
   - 明确展示后端返回的超期提示
3. `expired` 状态下区分：
   - `canInitiate=true` 表示仅上一轮支付尝试失效，可重试
   - `canInitiate=false` 表示强门禁，不可继续支付
4. 页面“当前状态”“按钮文案”“辅助提示”不再写死“拉卡拉”语义

完成标准：

1. 页面不再根据本地时间猜测是否超期
2. 强门禁和可重试的 `expired` 在页面上能明显区分

#### T05-4-2 支付方式面板按能力禁用

目标：

- 让支付方式选择面板与页面主按钮共享同一套能力裁决

建议范围：

- `../static/apps/h5/src/features/payment/components/payment-method-sheet.tsx`
- `../static/apps/h5/src/pages/payment-cashier-page.tsx`

建议动作：

1. 在线支付选项是否可点，只取决于后端已下发的能力
2. 当订单超过支付有效期时：
   - 在线支付不可点
   - 现金支付不可点
   - 其它方式已支付备注不可点
3. 当仅渠道不可用但订单未超期时：
   - 在线支付不可点
   - 线下登记选项仍保留
4. 面板内补足必要的禁用态文案或说明，避免用户误以为按钮失效

完成标准：

1. 面板选项和页面主按钮不会出现相互矛盾
2. 超期与渠道不可用两类原因在交互上可区分

#### T05-4-3 动作提交与错误回显收口

目标：

- 让前端动作层正确承接后端的 `1004`、`1005` 等业务错误

建议范围：

- `../static/apps/h5/src/features/payment/hooks/use-payment-actions.ts`

建议动作：

1. 保持 `confirmPay`、`resumePay`、`submitOffline` 只负责动作发起和错误透传
2. 后端返回 `1005` 时，前端直接显示服务端文案，不本地重写成泛化错误
3. 线下登记失败后保持页面可刷新、可重试，不做本地状态猜测修复

完成标准：

1. 页面错误提示和后端业务语义一致
2. 不再出现“按钮已禁用但错误文案仍像网络异常”的割裂体验

#### T05-4-4 轮询与终态体验校准

目标：

- 让轮询停止条件、页面刷新和支付终态展示与新的 `expired` 语义一致

建议范围：

- `../static/apps/h5/src/features/payment/hooks/use-payment-status-polling.ts`
- `../static/apps/h5/src/pages/payment-cashier-page.tsx`

建议动作：

1. 当 `/status` 返回 `expired` 且 `canInitiate=false` 时，停止轮询
2. 当 `/status` 返回 `expired` 且 `canInitiate=true` 时，允许页面进入“可重新支付”展示
3. 保证支付返回页刷新一次后，页面能正确同步最新 `paymentAction`
4. 清理页面中的渠道专属主文案，统一替换为中性“在线支付”“订单收银台”等表达

完成标准：

1. H5 页面体验与后端门禁完全一致
2. 页面不再通过本地时间或状态猜测是否可支付
3. 页面文案不再绑定具体支付渠道

### T05-5 验证与联调收口

目标：

- 验证支付有效期门禁与租户支付渠道配置门禁共同生效

建议范围：

- 后端构建与相关测试
- H5 本地联调

建议验证项：

1. 未超期且渠道可用
   - 可正常发起在线支付
2. 已超期
   - 页面可打开
   - 页面按钮禁用
   - `initiate` 被后端拒绝
   - `offline-payment` 被后端拒绝
3. 未超期但当前无生效渠道或渠道状态不可用
   - 页面可打开
   - 在线支付禁用
   - 原因文案正确
4. 仍存在未过期 `paying` 支付尝试
   - 继续支付逻辑正常

完成标准：

1. `pnpm -F api build`
2. 如可行，补与支付相关的最小 smoke 或联调
3. H5 本地页面验证通过
4. 文档、后端、前端三者语义一致

## 4. 保留原则

1. 本文档用于指导本轮“支付有效期 + 租户支付渠道配置”联动改造
2. 文档只记录章节边界、实施顺序与验证标准，不替代 `docs/api` 事实源
3. 若本主线全部完成，应转入归档目录
