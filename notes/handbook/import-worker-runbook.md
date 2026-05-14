# Docker Compose 统一托管 API 与 Import Worker 方案

适用场景：

- 希望长期走容器化路线
- 不再用 `pm2` 或 `systemd` 单独托管 Node 进程
- 需要让 API、导入 Worker、PostgreSQL、Redis、Nginx 全部由 `docker compose` 统一管理

## 1. 当前结论

当前项目的长期推荐路线是：

1. `api` 与 `import-worker` 都放进 Docker
2. 统一由 `docker compose` 管理容器生命周期
3. 不再单独使用 `pm2`
4. 不再单独使用 `systemd` 托管 `api` / `import-worker` 两个 Node 进程
5. 只保留系统层面对 `docker.service` 的开机自启管理

说明：

- 这里的“放弃 `systemd`”是指不再用它直接管理业务 Node 进程
- 并不是完全不需要 `systemd`
- 在 Linux 服务器上，通常仍建议保留 `docker.service` 开机自启

## 2. 为什么 Import Worker 要单独一个服务

导入正式任务不是同步接口，而是“提交任务 -> 后台消费”的模式：

1. 前端调用导入提交接口
2. API 进程只负责写入导入任务
3. Worker 进程轮询待处理任务
4. Worker 真正执行导入并更新任务状态

如果没有 Worker：

- 导入预检仍可用
- 正式导入任务会停留在 `pending`

## 3. Worker 是否需要单独端口或域名

不需要。

原因：

- `import-worker` 不是 HTTP 服务
- 它不会额外监听浏览器访问端口
- 它不需要二级域名或 Nginx 暴露入口

当前 Worker 只是一个后台进程：

- 连接 PostgreSQL
- 连接 Redis
- 轮询并消费导入任务

因此：

- 不需要新端口
- 不需要新域名
- 不需要安全组额外放行公网入口

## 4. 当前 compose 统一托管后的服务构成

统一管理后，容器服务包括：

1. `db`
2. `redis`
3. `api`
4. `import-worker`
5. `nginx`

其中：

- `api` 负责对外 HTTP 接口
- `import-worker` 负责后台任务消费
- `nginx` 继续对外暴露前端站点与 `/api`

## 5. 与短期方案的区别

短期务实方案通常是：

- API 作为一个进程
- Worker 作为一个进程
- 用 `pm2` 或 `systemd` 托管

长期统一方案则是：

- API 一个容器
- Worker 一个容器
- 全部交给 `docker compose`

优点：

1. 生命周期统一
2. 日志统一
3. 重启策略统一
4. 部署操作统一

## 6. 统一管理后的日常命令

### 6.1 启动全部服务

```bash
docker compose up -d --build
```

### 6.2 查看状态

```bash
docker compose ps
```

### 6.3 查看 API 日志

```bash
docker compose logs -f api
```

### 6.4 查看 Worker 日志

```bash
docker compose logs -f import-worker
```

### 6.5 重启 API

```bash
docker compose restart api
```

### 6.6 重启 Worker

```bash
docker compose restart import-worker
```

### 6.7 停止全部服务

```bash
docker compose down
```

## 7. 生产环境推荐操作顺序

### 7.1 首次部署

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f api
docker compose logs -f import-worker
```

### 7.2 发版更新

```bash
git pull
docker compose up -d --build
docker compose ps
docker compose logs -f api
docker compose logs -f import-worker
```

## 8. 统一托管后需要重点确认什么

至少确认以下事项：

1. `api` 容器正常启动
2. `import-worker` 容器正常启动
3. `POST /orders/import` 提交后任务状态不再停留在 `pending`
4. Worker 日志中能看到导入任务轮询与处理记录
5. 不需要新增任何公网端口或独立域名

## 9. 最终建议

如果你的目标是长期稳定运维，当前最推荐的治理方向是：

1. 保持 `api` 与 `import-worker` 都容器化
2. 用 `docker compose` 统一管理
3. 放弃 `pm2`
4. 不再单独用 `systemd` 托管业务 Node 进程
5. 只保留 `docker.service` 的系统级开机自启
