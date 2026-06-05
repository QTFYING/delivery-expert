# 环境变量手册

本文档说明本项目在不同部署场景下如何生成和填写环境变量。

## 变量文件位置

| 文件                    | 使用场景                                          | 是否提交 Git |
| ----------------------- | ------------------------------------------------- | ------------ |
| `apps/api/.env.example` | API 本地开发模板，也是 PM2 / 拉卡拉联调的起始模板 | 是           |
| `apps/api/.env`         | 本机 `pnpm dev:api` / PM2 开发态读取              | 否           |
| `.env`                  | 根目录 Docker Compose 读取                        | 否           |

说明：

- 本地直接运行 API 时，NestJS 从 `apps/api/.env` 加载变量。
- Docker Compose 部署时，Compose 从项目根目录 `.env` 读取变量并注入容器。
- 不要把真实密码、Redis 密码、JWT 密钥提交到 Git。

## 核心变量

| 变量                                              | 必填 | 说明                                                                   |
| ------------------------------------------------- | ---- | ---------------------------------------------------------------------- |
| `DATABASE_URL`                                    | 是   | Prisma PostgreSQL 连接串                                               |
| `REDIS_URL`                                       | 是   | Redis 连接串                                                           |
| `JWT_SECRET`                                      | 是   | JWT 签名密钥                                                           |
| `CORS_ORIGINS`                                    | 是   | 允许跨域访问的前端来源，多个用英文逗号分隔                             |
| `PORT`                                            | 否   | API 监听端口，默认 `3000`                                              |
| `NODE_ENV`                                        | 是   | `development` 或 `production`                                          |
| `TZ`                                              | 是   | 固定为 `UTC`，API / payment-api / Worker 运行环境统一使用 UTC          |
| `AUTH_COOKIE_SECURE`                              | 是   | HTTPS 环境为 `true`，本地 HTTP 为 `false`                              |
| `IMPORT_JOB_WORKER_ENABLED`                       | 是   | API 进程为 `false`，Worker 进程为 `true`                               |
| `IMPORT_ACTIVE_JOB_TENANT_TTL_SECONDS`            | 否   | 租户级活动正式导入任务占位 TTL，单位秒，默认 `900`                     |
| `IMPORT_ACTIVE_JOB_TENANT_RENEW_INTERVAL_SECONDS` | 否   | 租户级活动正式导入任务续期间隔，单位秒，默认 `60`，且必须小于 TTL      |
| `SMS_SEND_ENABLED`                                | 否   | 是否真实调用阿里云发送短信，默认 `false`                               |
| `SMS_DEBUG_CODE_VISIBLE`                          | 否   | 是否允许 debug 查码接口返回 Redis 明文验证码，默认 `true`              |
| `ALIYUN_ACCESS_KEY_ID`                            | 否   | 阿里云 AccessKey ID；`SMS_SEND_ENABLED=true` 时必填                    |
| `ALIYUN_ACCESS_KEY_SECRET`                        | 否   | 阿里云 AccessKey Secret；`SMS_SEND_ENABLED=true` 或启用 OSS 上传时必填 |
| `OSS_BUCKET`                                      | 否   | OSS Bucket；启用上传中心时必填                                         |
| `OSS_REGION`                                      | 否   | OSS Region；启用上传中心时必填                                         |
| `OSS_ENDPOINT`                                    | 否   | OSS Endpoint；启用上传中心时必填                                       |
| `OSS_PUBLIC_BASE_URL`                             | 否   | OSS 对象公开访问基础地址；启用上传中心时必填                           |
| `OSS_POLICY_EXPIRES_SECONDS`                      | 否   | OSS 直传凭证有效期，默认 `600`                                         |
| `OSS_AVATAR_MAX_SIZE_BYTES`                       | 否   | 用户头像最大字节数，默认 `81920`                                       |
| `ALIYUN_SMS_ENDPOINT`                             | 否   | 阿里云号码认证服务 PNVS Endpoint，默认 `dypnsapi.aliyuncs.com`         |
| `ALIYUN_SMS_SIGN_NAME`                            | 否   | 阿里云短信签名，当前默认 `速通互联验证码`                              |
| `ALIYUN_SMS_LOGIN_TEMPLATE_CODE`                  | 否   | Tenant 短信登录模板 Code，当前默认 `100001`                            |
| `ALIYUN_SMS_PASSWORD_RESET_TEMPLATE_CODE`         | 否   | Tenant 找回密码模板 Code，当前默认 `100001`                            |
| `ALIYUN_CAPTCHA_ENDPOINT`                         | 否   | 阿里云验证码 2.0 Endpoint，默认 `captcha.cn-shanghai.aliyuncs.com`     |
| `ALIYUN_CAPTCHA_SCENE_ID`                         | 否   | 阿里云验证码 2.0 SceneId；和 AccessKey 齐全时启用滑块校验              |
| `LAKALA_BASE_URL`                                 | 否   | 拉卡拉网关基础地址；启用拉卡拉时填写，默认 `https://api.lakala.com`    |
| `LAKALA_APP_ID`                                   | 否   | 拉卡拉应用 ID；启用拉卡拉时必填                                        |
| `LAKALA_SERIAL_NO`                                | 否   | 拉卡拉证书序列号；启用拉卡拉时必填                                     |
| `LAKALA_PRIVATE_KEY`                              | 否   | 拉卡拉商户私钥；启用拉卡拉时必填                                       |
| `LAKALA_PLATFORM_PUBLIC_KEY`                      | 否   | 拉卡拉平台公钥；启用拉卡拉时必填                                       |
| `LAKALA_NOTIFY_URL`                               | 否   | 拉卡拉异步通知地址；启用拉卡拉时必填                                   |

## 短信与验证码配置说明

短信真实发送由 `SMS_SEND_ENABLED` 控制。本地和测试环境可以保持 `false`，后端仍可生成验证码并通过后续 debug 查码接口辅助联调；生产启用真实发送时应设为 `true`。

`SMS_DEBUG_CODE_VISIBLE` 只控制 debug 查码接口是否可见，不参与验证码校验。生产环境建议设为 `false`；如临时开启，应配合网关/IP/权限限制。

阿里云短信当前使用号码认证服务 PNVS 的短信验证码接口，签名默认按 `速通互联验证码`，登录与找回密码模板可先共用系统赠送模板 `100001`。项目自行生成验证码并通过模板参数传给阿里云，不使用 `##code##` 让阿里云生成验证码。

阿里云验证码 2.0 是可选增强层。只有 `ALIYUN_CAPTCHA_SCENE_ID`、`ALIYUN_ACCESS_KEY_ID`、`ALIYUN_ACCESS_KEY_SECRET` 都填写时，后端才启用滑块服务端校验；未配置时不阻塞短信发送，风险由数据库存在性校验、Redis 频控和阿里云侧频控共同兜底。

## JWT_SECRET 生成

生产环境必须使用强随机密钥。推荐任选一种：

```bash
openssl rand -hex 32
```

```bash
openssl rand -base64 48
```

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

要求：

- 不使用 `replace-with-local-secret`、`123456`、公司名等可猜测内容。
- 生产密钥不要和本地开发共用。
- 变更 `JWT_SECRET` 会让已签发的 access token 失效。
- 建议通过服务器本机生成后写入 `.env`，不要在聊天工具或公开文档中传播。

## 本地无 Docker 开发示例

文件：`apps/api/.env`

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/shou_db?schema=public
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-with-local-secret
CORS_ORIGINS=http://localhost:5173,http://localhost:5001,http://localhost:5002,http://localhost:5003
PORT=3000
NODE_ENV=development
TZ=UTC
AUTH_COOKIE_SECURE=false
IMPORT_JOB_WORKER_ENABLED=false
IMPORT_ACTIVE_JOB_TENANT_TTL_SECONDS=900
IMPORT_ACTIVE_JOB_TENANT_RENEW_INTERVAL_SECONDS=60
SMS_SEND_ENABLED=false
SMS_DEBUG_CODE_VISIBLE=true
ALIYUN_ACCESS_KEY_ID=
ALIYUN_ACCESS_KEY_SECRET=
ALIYUN_SMS_ENDPOINT=dypnsapi.aliyuncs.com
ALIYUN_SMS_SIGN_NAME=速通互联验证码
ALIYUN_SMS_LOGIN_TEMPLATE_CODE=100001
ALIYUN_SMS_PASSWORD_RESET_TEMPLATE_CODE=100001
ALIYUN_CAPTCHA_ENDPOINT=captcha.cn-shanghai.aliyuncs.com
ALIYUN_CAPTCHA_SCENE_ID=
```

## 开发机 PM2 + 1Panel 示例

文件：`apps/api/.env`

```env
DATABASE_URL=postgresql://<PostgreSQL用户名>:<PostgreSQL密码>@localhost:5432/shou_db?schema=public
REDIS_URL=redis://:<Redis密码>@localhost:6379
JWT_SECRET=<本机开发密钥>
CORS_ORIGINS=http://localhost:5173,http://localhost:5001,http://localhost:5002,http://localhost:5003
PORT=3000
NODE_ENV=development
TZ=UTC
AUTH_COOKIE_SECURE=false
IMPORT_JOB_WORKER_ENABLED=false
IMPORT_ACTIVE_JOB_TENANT_TTL_SECONDS=900
IMPORT_ACTIVE_JOB_TENANT_RENEW_INTERVAL_SECONDS=60
SMS_SEND_ENABLED=false
SMS_DEBUG_CODE_VISIBLE=true
ALIYUN_ACCESS_KEY_ID=
ALIYUN_ACCESS_KEY_SECRET=
ALIYUN_SMS_ENDPOINT=dypnsapi.aliyuncs.com
ALIYUN_SMS_SIGN_NAME=速通互联验证码
ALIYUN_SMS_LOGIN_TEMPLATE_CODE=100001
ALIYUN_SMS_PASSWORD_RESET_TEMPLATE_CODE=100001
ALIYUN_CAPTCHA_ENDPOINT=captcha.cn-shanghai.aliyuncs.com
ALIYUN_CAPTCHA_SCENE_ID=
```

说明：

- 如果 API 进程由 PM2 直接运行在宿主机，PostgreSQL / Redis 地址使用 `localhost`。
- `IMPORT_JOB_WORKER_ENABLED=false` 是 API 进程口径；Worker 进程会在 PM2 配置中覆盖为 `true`。
- `IMPORT_ACTIVE_JOB_TENANT_TTL_SECONDS` 建议 API 与 Worker 保持一致，避免租户活动导入占位判断不一致。
- `IMPORT_ACTIVE_JOB_TENANT_RENEW_INTERVAL_SECONDS` 必须小于 TTL；默认 `60` 秒即可，不建议调得接近 TTL。

## 阿里云 + 1Panel 生产示例

文件：项目根目录 `.env`

```env
DATABASE_URL=postgresql://<PostgreSQL用户名>:<PostgreSQL密码>@host.docker.internal:5432/shou_db?schema=public
REDIS_URL=redis://:<Redis密码>@host.docker.internal:6379
JWT_SECRET=<生产随机密钥>
CORS_ORIGINS=https://mp.shoudanba.cn,https://www.shoudanba.cn,https://h5.shoudanba.cn
TZ=UTC
AUTH_COOKIE_SECURE=true
IMPORT_ACTIVE_JOB_TENANT_TTL_SECONDS=900
IMPORT_ACTIVE_JOB_TENANT_RENEW_INTERVAL_SECONDS=60
SMS_SEND_ENABLED=true
SMS_DEBUG_CODE_VISIBLE=false
ALIYUN_ACCESS_KEY_ID=<阿里云AccessKey ID>
ALIYUN_ACCESS_KEY_SECRET=<阿里云AccessKey Secret>
ALIYUN_SMS_ENDPOINT=dypnsapi.aliyuncs.com
ALIYUN_SMS_SIGN_NAME=速通互联验证码
ALIYUN_SMS_LOGIN_TEMPLATE_CODE=100001
ALIYUN_SMS_PASSWORD_RESET_TEMPLATE_CODE=100001
ALIYUN_CAPTCHA_ENDPOINT=captcha.cn-shanghai.aliyuncs.com
ALIYUN_CAPTCHA_SCENE_ID=<开通阿里云验证码2.0后填写，未开通可留空>
LAKALA_BASE_URL=https://s2.lakala.com
LAKALA_APP_ID=<拉卡拉应用ID>
LAKALA_SERIAL_NO=<拉卡拉证书序列号>
LAKALA_PRIVATE_KEY="<拉卡拉商户私钥，使用 \n 保留换行>"
LAKALA_PLATFORM_PUBLIC_KEY="<拉卡拉平台公钥，使用 \n 保留换行>"
LAKALA_NOTIFY_URL=https://api.shoudanba.cn/api/payment/webhook/lakala
```

说明：

- 该场景使用根目录 `docker-compose.yml`。
- `host.docker.internal` 由 compose 中的 `extra_hosts: host-gateway` 映射到宿主机。
- API / payment-api / Worker 容器访问的是宿主机上 1Panel 托管的 PostgreSQL / Redis。
- `CORS_ORIGINS` 只填写前端来源域名，不填写 `api` 域名。
- 1Panel 托管 PostgreSQL 需将实例时区设为 `UTC`；执行 `SHOW timezone;` 应返回 `UTC`。

## 常见错误

### 容器内使用 localhost 访问数据库

错误：

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/shou_db?schema=public
```

在容器内，`localhost` 指容器自己，不是宿主机。

修正：

- 阿里云 + 1Panel：使用 `host.docker.internal`
- 全 Docker Compose：使用服务名 `postgres`

### CORS_ORIGINS 填了 API 域名

错误：

```env
CORS_ORIGINS=https://api.shoudanba.cn
```

修正：

```env
CORS_ORIGINS=https://mp.shoudanba.cn,https://www.shoudanba.cn,https://h5.shoudanba.cn
```

### 生产环境 AUTH_COOKIE_SECURE=false

HTTPS 环境应使用：

```env
AUTH_COOKIE_SECURE=true
```

否则浏览器 Cookie 行为可能和预期不一致。
