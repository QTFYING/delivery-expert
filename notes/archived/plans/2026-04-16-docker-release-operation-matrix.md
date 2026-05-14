# Docker 发布动作判断矩阵

> 文档状态：阶段性操作判断稿，已归档

适用场景：

- 当前项目通过 `docker-compose.yml` 在服务器上部署
- 需要判断某次 Git 提交后，到底该执行什么发布动作
- 需要区分“重建镜像”“重建容器”“容器内 reload”“无需操作”这几类动作

本文基于当前仓库实际结构整理：

- `api` 与 `import-worker` 都通过 `Dockerfile` 构建镜像
- `nginx.conf` 通过 volume 挂载到 `shou-nginx`
- 前端 `dist/admin`、`dist/tenant`、`dist/h5` 通过 volume 挂载到 `shou-nginx`
- 当前 `api` / `import-worker` 容器启动时会执行 `prisma db push --skip-generate`

## 1. 先记住一个核心原则

如果改动内容最终需要进入镜像里的 `dist` 或 `node_modules`，就不要优先想 `docker exec`，而要优先想：

1. 重建镜像
2. 重建容器

`docker exec` 更适合做：

- 进容器排查
- 执行一次性命令
- 检查配置
- 重新加载进程配置

它不适合作为“代码发布”的标准动作。

## 2. 本次提交 `e16322dc2b838866088a0146ce8493b0d8064226` 的判断

提交内容：

- `apps/api/src/app.module.ts`
- `apps/api/src/common/middleware/request-logging.middleware.ts`

提交说明：

- 新增请求日志中间件，挂载在 `AppModule` 上
- 属于 NestJS API 业务代码改动
- 没有修改 `Dockerfile`
- 没有修改 `docker-compose.yml`
- 没有修改 `nginx.conf`
- 没有修改 `package.json`
- 没有修改 Prisma schema

结论：

- 不需要 `docker exec`
- 不需要单独修改 Compose 配置
- 最小动作是重建 `api` 服务

推荐动作：

```bash
docker compose up -d --build api
```

稳妥动作：

```bash
docker compose up -d --build api import-worker
```

说明：

- 这次改动直接影响 `dist/main`
- `import-worker` 入口是 `dist/import-worker.main`，本次提交没有直接动到它
- 所以最小发布动作只需要重建 `api`

## 3. 发布动作矩阵

### 3.1 改 `Dockerfile`

典型场景：

- Node 版本变了
- 安装依赖步骤变了
- 构建命令变了
- 启动命令变了

需要做：

- 重建镜像
- 重建相关容器

推荐动作：

```bash
docker compose up -d --build api import-worker
```

如果还影响其他服务，也要一起重建。

### 3.2 改 `docker-compose.yml`

典型场景：

- 端口映射变了
- 环境变量注入变了
- volume 变了
- command 变了
- 服务数量变了

需要做：

- 重新创建受影响的容器
- 若同时涉及镜像构建内容变化，再加 `--build`

常见动作：

```bash
docker compose up -d
```

或：

```bash
docker compose up -d --build
```

说明：

- 仅 `restart` 不够
- 因为容器创建时的配置已经固化

### 3.3 改 `nginx.conf`

当前项目中，`nginx.conf` 是挂载文件，不是打进镜像的：

```yaml
- ./nginx.conf:/etc/nginx/conf.d/default.conf
```

所以改完后通常不需要重建镜像。

需要做：

- 校验配置
- 重新加载 Nginx

推荐动作：

```bash
docker exec shou-nginx nginx -t
docker exec shou-nginx nginx -s reload
```

或者简单一点：

```bash
docker compose restart nginx
```

### 3.4 改生产根目录 `.env`

这里指的是与 `docker-compose.yml` 同级的 `.env`。

典型场景：

- 改 `POSTGRES_PASSWORD`
- 改 `JWT_SECRET`
- 改 `CORS_ORIGINS`
- 改 `AUTH_COOKIE_SECURE`

需要做：

- 重新创建受影响服务
- 一般不必 `--build`

常见动作：

```bash
docker compose up -d api import-worker
```

如果改的是数据库相关变量，也可能还要带上 `db`。

注意：

- 如果 PostgreSQL 已经有旧数据卷，单改 `POSTGRES_PASSWORD` 不会自动修改数据库里已有用户密码
- 这是数据库状态问题，不是 Compose 文本配置问题

### 3.5 改 `apps/api/.env`

对当前 Docker Compose 生产部署来说，通常没有直接作用。

原因：

- 当前生产环境变量主要来自 `docker-compose.yml`
- 当前镜像构建会忽略 `.env*`
- 容器运行时并不读取服务器上的 `apps/api/.env`

结论：

- 改这个文件，一般不会影响当前生产容器
- 它更适合本地裸跑 `pnpm -F api start:prod` / `start:dev`

### 3.6 改 `package.json` / `pnpm-lock.yaml`

典型场景：

- 新增依赖
- 升级依赖
- workspace 依赖变化
- lockfile 变化

需要做：

- 重建镜像
- 重建相关容器

推荐动作：

```bash
docker compose up -d --build api import-worker
```

### 3.7 改 `apps/api/src/**` 业务代码

典型场景：

- controller
- service
- module
- middleware
- guard
- dto

需要做：

- 重建受影响服务的镜像

经验口径：

- 只改 HTTP API 代码：最小重建 `api`
- 改导入消费逻辑：重建 `import-worker`
- 不确定是否共用：直接重建 `api import-worker`

示例：

```bash
docker compose up -d --build api
```

或：

```bash
docker compose up -d --build api import-worker
```

### 3.8 改 `packages/types` / `packages/utils` / 共享代码

这类改动经常同时影响 `api` 与 `import-worker`。

需要做：

- 重建 `api`
- 重建 `import-worker`

推荐动作：

```bash
docker compose up -d --build api import-worker
```

### 3.9 改 `apps/api/prisma/schema.prisma`

这是高风险改动。

需要做：

- 重建 `api`
- 重建 `import-worker`
- 同时评估数据库结构变更影响

推荐动作：

```bash
docker compose up -d --build api import-worker
```

额外注意：

- 当前容器启动时会执行 `prisma db push --skip-generate`
- 这意味着 schema 改动会在容器启动阶段尝试同步到数据库
- 生产发版前必须先评估数据丢失风险并做好备份

### 3.10 改前端 `dist/admin` / `dist/tenant` / `dist/h5`

当前项目中，这三套前端产物通过 volume 挂载到 `nginx`：

```yaml
- ./dist/admin:/usr/share/nginx/admin
- ./dist/tenant:/usr/share/nginx/tenant
- ./dist/h5:/usr/share/nginx/pay-h5
```

所以：

- 一般不需要重建 API 镜像
- 一般也不需要重建 Nginx 镜像

常见动作：

1. 替换宿主机上的 `dist`
2. 必要时重启 Nginx

例如：

```bash
docker compose restart nginx
```

### 3.11 只改文档、README、notes

不需要任何容器操作。

## 4. 一页速查

### 只改 `apps/api/src` 业务代码

```bash
docker compose up -d --build api
```

不确定是否影响 Worker：

```bash
docker compose up -d --build api import-worker
```

### 改 `package.json` / lockfile / shared

```bash
docker compose up -d --build api import-worker
```

### 改 `docker-compose.yml`

```bash
docker compose up -d
```

如同时涉及镜像变化：

```bash
docker compose up -d --build
```

### 改 `nginx.conf`

```bash
docker exec shou-nginx nginx -t
docker exec shou-nginx nginx -s reload
```

### 改生产根 `.env`

```bash
docker compose up -d api import-worker
```

### 改前端 `dist`

```bash
docker compose restart nginx
```

## 5. 当前项目的默认推荐习惯

为了减少误判，当前项目建议遵守以下习惯：

1. 代码改动优先走 `docker compose up -d --build ...`，不要靠 `docker exec` 进容器手工修。
2. `nginx.conf` 这种挂载配置优先 reload，不要动镜像。
3. 生产根 `.env` 改动后，记得重新创建容器，而不是只重启。
4. Prisma schema 改动一律按高风险发布处理。
5. 不确定改动影响范围时，优先重建 `api + import-worker`，不要只赌一个服务。
