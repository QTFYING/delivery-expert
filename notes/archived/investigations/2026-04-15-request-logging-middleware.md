# 2026-04-15 请求日志中间件接入说明

> 文档状态：实现已落地，已归档

## 背景

在本地前端联调生产 API 时，需要快速确认：

1. 请求是否真的到达后端
2. 请求路径、状态码和耗时是否符合预期
3. 发生 4xx / 5xx 时，是否能在 API 容器内第一时间看到对应记录

原有后端实现缺少统一的 HTTP access log，中间件接入前只能依赖：

1. 1Panel/OpenResty 日志
2. 容器异常日志
3. 业务代码中零散的 `Logger`

这不利于后续联调与线上排查。

## 目标

增加一个最小、稳定、默认开启的全局请求日志中间件，用于记录每个 HTTP 请求的基本访问信息。

本次目标不包括：

1. 打印请求体
2. 打印敏感字段
3. 引入复杂日志平台或链路追踪系统

## 实现位置

### 新增文件

- `apps/api/src/common/middleware/request-logging.middleware.ts`

### 接入位置

- `apps/api/src/app.module.ts`

## 日志内容

当前中间件记录以下字段：

1. `method`
2. `requestPath`
3. `status`
4. `duration`
5. `ip`
6. `origin`
7. `proxyEnv`
8. `requestId`

日志示例：

```text
[Nest] ... LOG [HttpRequest] POST /api/auth/login status=200 duration=18ms ip=127.0.0.1 origin=http://localhost:5001 proxyEnv=pro
```

## 分级规则

### 正常请求

当状态码 `< 400` 时：

1. 使用 `logger.log`

### 客户端错误

当状态码 `>= 400 && < 500` 时：

1. 使用 `logger.warn`

### 服务端错误

当状态码 `>= 500` 时：

1. 使用 `logger.error`

## 安全边界

本次实现显式遵守以下边界：

1. 不记录请求体
2. 不记录登录密码
3. 不记录 Token 明文
4. 只记录联调定位所需的基础访问元信息

这意味着：

1. 该中间件适合直接默认开启
2. 不会因为登录请求而把账号密码写入日志

## 为什么不用请求体日志

登录、刷新令牌、支付等接口都涉及敏感字段。

如果把请求体直接打到日志中，会带来以下风险：

1. 密码泄露
2. Token 泄露
3. 支付相关上下文泄露

因此当前策略是：

1. 统一记录请求元信息
2. 业务字段问题通过局部 debug 或针对性日志排查

## 代码接入方式

在 `AppModule` 中实现 `NestModule`，通过全局中间件方式挂载：

```ts
consumer.apply(RequestLoggingMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
```

这样做的好处：

1. 不需要逐个 Controller 接入
2. 可以覆盖所有 HTTP 路由
3. 适合作为默认联调和排障能力

## 本次构建验证

本地已执行：

```bash
pnpm -F api build
```

结果：

1. 构建通过
2. 中间件接入未引入类型错误或模块错误

## 生产生效步骤

```bash
cd /data/www/sinhe
git pull
docker compose up -d --build api
```

## 查看方式

```bash
docker compose logs -f api --tail=200
```

如果请求命中后端，会看到类似：

```text
[Nest] ... LOG [HttpRequest] POST /api/auth/login status=200 duration=23ms ip=172.x.x.x origin=http://localhost:5001 proxyEnv=pro
```

## 当前价值

本次请求日志中间件主要解决以下问题：

1. 快速确认请求是否进入后端
2. 快速判断是 `4xx` 还是 `5xx`
3. 快速看到联调来源和代理环境
4. 减少后续每次联调都去查反向代理日志的成本

## 后续可选增强

如果后续联调复杂度继续上升，可以考虑继续增强：

1. 统一注入并透传 `X-Request-Id`
2. 记录用户标识和租户标识
3. 输出结构化 JSON 日志
4. 接入集中日志平台

当前阶段先保持最小实现，不做过度扩展。
