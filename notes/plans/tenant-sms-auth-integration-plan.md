# Tenant 端短信认证接入方案

> 日期：2026-05-28
> 文档状态：方案归档
> 文档定位：非事实源施工方案，正式编码前必须按 `docs/api -> DTO/Swagger -> contracts -> implementation` 同步事实源
> 适用范围：Tenant 端短信登录、短信验证码找回密码、阿里云号码认证服务短信验证码接入、可选阿里云验证码 2.0 接入
> 当前决策：本期只做 Tenant 端；短信入口以绑定手机号定位租户用户；Admin 端暂不纳入；阿里云验证码 2.0 未开通时不阻塞短信发送

## 一、目标与结论

本期目标是在当前 Auth 体系上新增 Tenant 端短信认证能力，用于：

- Tenant 端手机号短信登录
- Tenant 端通过短信验证码找回密码
- 在已开通阿里云验证码 2.0 时，发送短信前通过滑块降低恶刷风险
- 未开通阿里云验证码 2.0 时，直接走短信发送，但必须先确认手机号能唯一解析到有效租户用户
- 通过 Redis 管理验证码生命周期、限流和调试明文

当前结论：

- `account` 继续作为账号密码登录账号
- `phone` 作为短信触达与短信认证手机号
- Tenant 端有效用户手机号在全平台租户范围内不允许重复
- 发送验证码前必须先查询数据库，只有手机号能唯一命中有效 Tenant 用户时才真实发送短信
- 验证码主链路不落库，Redis 中只保存 HMAC
- 调试明文验证码只作为辅助 key 存在，不参与业务验证
- 行为开关只保留 `SMS_SEND_ENABLED` 与 `SMS_DEBUG_CODE_VISIBLE`
- 阿里云短信使用已准备的 AccessKey ID / AccessKey Secret
- 阿里云发送接口采用号码认证服务 PNVS 的 `Dypnsapi.SendSmsVerifyCode`
- 短信签名当前按 `速通互联验证码` 接入，系统赠送模板 Code 可先使用 `100001`
- 项目继续自行生成验证码并写 Redis HMAC，发送时传入真实验证码值，不使用示例中的 `##code##` 动态生成占位
- 阿里云验证码 2.0 作为可选增强层，供应商参数存在且完整时启用，否则跳过

## 二、核心边界

### 1. 不把短信入口绑定到 account

当前系统中 `account` 的语义不是纯手机号：

- Admin 端可能使用 `admin`、`zhangsan` 这类非手机号账号
- Admin 用户可额外绑定 `phone`
- Tenant 端创建用户时，当前默认把 `phone` 同步为 `account`
- Tenant 端仍保留过可传自定义 `account` 的契约余地

因此短信登录与找回密码不能简单按 `account` 定位用户。

本期规则：

```text
账号密码登录：继续使用 User.account
短信认证入口：使用 User.phone
```

### 2. 本期只做 Tenant 端

本期不做：

- Admin 端短信登录
- Admin 端短信找回密码
- H5 支付页短信能力
- 多租户选择页

Tenant 短信入口只查询：

```text
tenantId != null
deletedAt = null
phone = 输入手机号
```

命中唯一可登录租户用户时，才允许短信登录或找回密码。

命中 0 个、多个、用户禁用、租户不可用时，不调用短信供应商，不真实发送短信，并统一返回泛化结果，不向前端暴露具体原因。

### 3. Tenant 手机号唯一

启用短信登录后，有效 Tenant 用户手机号必须在全平台租户范围内唯一。

需要在租户用户创建、更新时拦截重复手机号。

历史重复手机号若存在：

- 不直接做自动合并
- 重复命中的手机号不能使用短信登录或找回密码
- 后续通过人工数据清理解决

删除租户用户时，沿用现有 phone 改写策略，释放原手机号占用。

## 三、接口设计

### 1. 发送短信验证码

```http
POST /auth/sms-codes
```

用途：

- 统一发送 Tenant 短信登录验证码
- 统一发送 Tenant 找回密码验证码

请求字段：

```ts
{
  phone: string;
  scene: 'tenant_login' | 'tenant_password_reset';
  captchaVerifyParam?: string;
}
```

行为：

- 发送前必须先按手机号唯一解析到有效 Tenant 用户
- 未解析到有效 Tenant 用户时不调用阿里云短信，响应仍不暴露用户是否存在
- 阿里云验证码 2.0 配置完整时，真实发送前校验滑块
- 阿里云验证码 2.0 未配置或未开通时，跳过滑块校验
- `SMS_SEND_ENABLED=true` 时调用阿里云短信
- `SMS_SEND_ENABLED=false` 时不调用阿里云短信，只生成验证码并写 Redis
- 发送成功或符合泛化失败策略时，响应不暴露用户是否存在
- 验证码 TTL 为 5 分钟
- 同手机号同场景重发冷却为 60 秒

### 2. 短信登录

```http
POST /auth/sms-login
```

请求字段：

```ts
{
  phone: string;
  code: string;
}
```

行为：

- 校验 `tenant_login` 场景验证码
- 唯一解析 Tenant 用户
- 复用现有登录会话创建逻辑
- 返回现有登录响应结构
- 继续通过 HttpOnly refresh cookie 下发刷新令牌

### 3. 短信找回密码

```http
POST /auth/password-resets
```

请求字段：

```ts
{
  phone: string;
  code: string;
  newPassword: string;
}
```

行为：

- 校验 `tenant_password_reset` 场景验证码
- 唯一解析 Tenant 用户
- 新密码复用现有密码强度规则
- 新密码不能与旧密码相同
- 更新密码后清除 `requiresPasswordReset`
- 重置成功后递增 token version 并撤销该用户全部 refresh session

### 4. 调试查询验证码明文

```http
GET /auth/sms-codes/debug
```

用途：

- 测试和联调时查询 Redis debug key 中的明文验证码

行为：

- 仅当 `SMS_DEBUG_CODE_VISIBLE=true` 时返回
- 返回 TTL 内最近一次验证码
- 不参与正式验证码校验逻辑
- 路径必须包含 `debug`，避免和正式发送接口混淆

安全说明：

- 正式生产环境禁止同时开启 `SMS_SEND_ENABLED=true` 与 `SMS_DEBUG_CODE_VISIBLE=true`
- 本期先通过文档约束，不做启动失败
- 若实际部署需要长期开放 debug 查询，应另行补管理员鉴权、IP 限制和审计日志

## 四、Redis 与安全策略

### 1. Redis key 语义

建议 key 形态：

```text
auth:sms:code:{scene}:{phone}
auth:sms:debug-code:{scene}:{phone}
auth:sms:cooldown:{scene}:{phone}
auth:sms:daily:{scene}:{phone}:{yyyyMMdd}
auth:sms:ip:{scene}:{ip}:{minute}
```

主验证码记录只保存 HMAC：

```ts
{
  codeHash: string;
  scene: 'tenant_login' | 'tenant_password_reset';
  phone: string;
  attempts: number;
  createdAt: number;
}
```

HMAC 输入建议包含：

```text
scene + phone + code
```

HMAC secret 使用服务端已有安全 secret 或新增内部 secret。

### 2. 明文验证码

当 `SMS_DEBUG_CODE_VISIBLE=true` 时，额外写入 debug key：

```text
auth:sms:debug-code:{scene}:{phone}
```

该 key：

- 保存明文验证码
- TTL 与主验证码一致
- 不参与验证码校验
- 只供 debug 查询接口读取

### 3. 限流策略

后端仍需保留基础 Redis 限流，滑块不能替代限流。

默认策略：

- 验证码有效期：5 分钟
- 同手机号同场景重发冷却：60 秒，即每分钟最多 1 条
- 同手机号同场景每日发送上限：建议 5 到 10 条
- 同 IP 同场景分钟级发送上限：建议 5 条
- 同 IP 同场景小时级发送上限：建议 30 条
- 全局短信发送分钟级上限：建议按业务规模配置，避免异常流量打穿短信余额
- 同验证码最多错误：5 次
- 验证成功后一次性删除
- 同手机号同场景设置日上限
- 同 IP 同场景设置分钟级频控

阿里云侧也应配置短信发送频率限制、余额告警和异常发送告警。

## 五、阿里云接入

### 1. 短信服务

新增短信发送基础设施，封装阿里云号码认证服务 PNVS 短信验证码调用，不让 Auth 业务代码直接依赖供应商 SDK。

建议职责：

- 组装 `SendSmsVerifyCodeRequest`
- 调用 `Dypnsapi.SendSmsVerifyCode`
- 归一发送成功、失败、供应商 requestId
- 支持 `SMS_SEND_ENABLED=false` 的假发送模式

本期采用项目自生成验证码：

```text
templateParam = {"code":"123456","min":"5"}
```

不采用官方示例中的：

```text
templateParam = {"code":"##code##","min":"5"}
```

原因：

- `##code##` 会让阿里云动态生成验证码，并要求后续通过阿里云校验接口核验
- 当前项目需要 Redis HMAC、debug 明文查码、错误次数、一次性消费和场景隔离
- 项目自生成验证码更符合当前 Auth 方案边界

### 2. 验证码 2.0 滑块

前端完成阿里云验证码交互后，将 `captchaVerifyParam` 提交给后端。

后端职责：

- 当验证码 2.0 配置完整时，在真实发送短信前调用阿里云服务端校验
- 当验证码 2.0 未开通或配置缺失时，跳过滑块校验，不阻塞短信发送
- 校验失败时拒绝发送短信
- 不把滑块结果作为用户身份依据

### 3. 环境变量

行为开关：

```env
SMS_SEND_ENABLED=false
SMS_DEBUG_CODE_VISIBLE=true
```

仍需补充阿里云供应商配置，例如：

```env
ALIYUN_ACCESS_KEY_ID=
ALIYUN_ACCESS_KEY_SECRET=
ALIYUN_SMS_ENDPOINT=dypnsapi.aliyuncs.com
ALIYUN_SMS_SIGN_NAME=速通互联验证码
ALIYUN_SMS_LOGIN_TEMPLATE_CODE=100001
ALIYUN_SMS_PASSWORD_RESET_TEMPLATE_CODE=100001
ALIYUN_CAPTCHA_SCENE_ID=
ALIYUN_CAPTCHA_APP_KEY=
```

说明：

- `ALIYUN_ACCESS_KEY_SECRET` 不得写入仓库或聊天记录
- `ALIYUN_SMS_LOGIN_TEMPLATE_CODE` 与 `ALIYUN_SMS_PASSWORD_RESET_TEMPLATE_CODE` 可以先共用系统赠送模板 `100001`
- 若后续申请到独立模板，可再拆成登录模板和找回密码模板
- 验证码 2.0 配置缺失时，不启用滑块校验
- 具体变量名可在正式实现时按项目配置模块统一命名

## 六、实施拆分

### T01 文档与契约事实源

目标：

- 在 `docs/api` 中落定 Tenant 短信认证语义
- 在 contracts 中新增请求响应结构
- 同步 DTO / Swagger

完成标准：

- 前端能根据 API 文档理解短信登录、找回密码、debug 查码边界
- Swagger 与 contracts 字段一致

### T02 短信与滑块基础设施

目标：

- 新增短信发送服务
- 新增阿里云滑块服务端校验服务
- 接入配置读取
- 使用 `@alicloud/dypnsapi20170525` 与 OpenAPI Client 封装 PNVS 短信验证码发送
- 使用项目生成的验证码值填充模板参数，不使用 `##code##`

完成标准：

- `SMS_SEND_ENABLED=false` 时不调用阿里云
- `SMS_SEND_ENABLED=true` 且验证码 2.0 配置完整时，缺少滑块或滑块失败不能发短信
- `SMS_SEND_ENABLED=true` 但验证码 2.0 未配置时，直接进入短信发送与 Redis 限流流程

### T03 Redis 验证码与限流

目标：

- 封装验证码生成、HMAC 存储、校验、消费
- 封装同手机号 60 秒冷却、日上限、IP 分钟/小时频控、全局发送上限、错误次数
- 支持 debug 明文 key

完成标准：

- 验证码不落库
- 主链路不存明文
- debug 明文只在开关开启时可查
- 未解析到有效 Tenant 用户时不调用短信供应商

### T04 Tenant 短信登录与找回密码

目标：

- 新增发送验证码、短信登录、找回密码接口
- 复用现有 Auth 会话创建和密码强度规则
- 重置密码后撤销旧会话

完成标准：

- 正确验证码可短信登录
- 正确验证码可重置密码
- 错误、过期、重复使用验证码均失败
- 不泄露用户是否存在
- 发送验证码前必须先确认手机号唯一命中有效 Tenant 用户

### T05 Tenant 手机号唯一约束

目标：

- 租户用户创建、更新时拦截全平台租户有效手机号重复
- 历史重复命中时短信入口泛化失败

完成标准：

- 新增有效租户用户不能复用已有有效租户手机号
- 删除用户后原手机号可重新使用

### T06 验证与部署说明

目标：

- 补 `.env.example`
- 补部署文档
- 跑后端构建与冒烟验证

建议验证命令：

```bash
pnpm -F api build
pnpm -F api test:smoke
pnpm lint
pnpm format:check
```

如改动范围较大，章节收尾再跑：

```bash
pnpm check:backend
```

## 七、验收场景

- `SMS_SEND_ENABLED=false` 时，发送验证码不调用阿里云，但 Redis 有主验证码记录
- `SMS_DEBUG_CODE_VISIBLE=true` 时，可通过 debug 接口查到 TTL 内验证码
- `SMS_DEBUG_CODE_VISIBLE=false` 时，debug 接口不返回明文
- `SMS_SEND_ENABLED=true` 且验证码 2.0 配置完整时，发送短信必须通过滑块校验
- `SMS_SEND_ENABLED=true` 但验证码 2.0 未配置时，可直接发送短信
- 不存在的手机号不会调用阿里云短信，且响应不暴露用户是否存在
- 正确手机号和验证码可以完成 Tenant 短信登录
- 正确手机号、验证码和新密码可以完成找回密码
- 找回密码成功后，该用户旧 token 和 refresh session 全部失效
- 错误验证码达到上限后验证码作废
- 过期验证码不能使用
- 同一验证码不能重复使用
- 禁用用户、删除用户、不可用租户不能短信登录
- 重复手机号命中时不能短信登录或找回密码
- 新建或更新租户用户时，重复有效租户手机号被拦截

## 八、风险与约束

- 滑块只能降低机器请求概率，不能替代 Redis 限流、短信发送频控和预算告警
- 未开通验证码 2.0 时，盗刷防护主要依赖数据库存在性校验、手机号唯一性、Redis 频控、阿里云侧频控和预算告警
- 公开 debug 查码只适合测试便利，不适合正式真实短信链路
- 正式生产不得同时开启 `SMS_SEND_ENABLED=true` 与 `SMS_DEBUG_CODE_VISIBLE=true`
- 本期不处理 Admin 端短信找回密码，否则需要另行定义 `account + phone` 绑定校验规则
- 本期不处理同一手机号跨租户多账号登录选择，因为已决策全平台租户手机号唯一

