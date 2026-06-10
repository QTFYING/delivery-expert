# 阿里云生产部署：无 1Panel，全 Docker Compose 编排

本文档适用于不使用 1Panel 的生产环境。

目标形态：

- Nginx、PostgreSQL、Redis 与后端服务全部由 Docker Compose 编排。
- 前端静态资源由内层 Nginx 容器托管。
- API、payment-api 与 Worker 运行镜像内构建好的 `dist`。
- 不使用 PM2。
- HTTPS、证书、外网 `80/443` 由最外层 Nginx / SLB / 网关统一处理。
- 当前仓库内置的 `nginx.conf` 只负责应用层 HTTP 分发，不负责证书。

## 1. 为什么采用内层 HTTP 版

本方案明确采用“内层 HTTP，外层 HTTPS”的分层。

原因：

1. 证书统一放在最外层网关，运维集中，不需要把证书分发到应用容器。
2. 内层 `shou-nginx` 只负责静态资源与 API 回源，职责更单一。
3. 避免双层 TLS 终止，减少配置复杂度。
4. 应用容器重建、迁移时不需要处理证书和 HTTPS 配置。
5. 更适合你现有的“最外层统一反向代理”架构。

因此，本场景下的 [nginx.conf](../../nginx.conf) 不是公网边缘 Nginx，而是**应用内层 HTTP 分发层**。

## 2. 与当前主方案的区别

根目录 [docker-compose.yml](../../docker-compose.yml) 是“阿里云 + 1Panel”场景的文件，不适合直接改成全栈编排。

当前仓库已提供：

```text
docker-compose.full.yml
```

原因：

- 避免破坏当前已经验证过的 1Panel 生产方案。
- 两种部署方式的网络、服务名、端口、安全边界完全不同。
- 后续排查问题时可以明确知道当前服务器使用哪套入口。

## 3. 推荐拓扑

```text
公网用户
  |
  v
最外层 Nginx / SLB / 网关（负责 80/443 与 HTTPS）
  |-- mp.shoudanba.cn  -> 宿主机:5001
  |-- www.shoudanba.cn -> 宿主机:5002
  |-- h5.shoudanba.cn  -> 宿主机:5003
  |-- api.shoudanba.cn -> 宿主机:3000
                      |
                      v
                Docker: shou-nginx
                  |-- /usr/share/nginx/admin
                  |-- /usr/share/nginx/tenant
                  |-- /usr/share/nginx/pay-h5
                  |-- proxy /api -> Docker: api:3000

Docker: api
  |-- postgres:5432
  |-- redis:6379

Docker: payment-api
  |-- postgres:5432
  |-- redis:6379

Docker: import-worker
  |-- postgres:5432
  |-- redis:6379
```

## 4. 编排文件边界

当前仓库内的 [docker-compose.full.yml](../../docker-compose.full.yml) 是本场景的编排事实源。

- 服务清单、容器名、端口、依赖关系和环境变量转发以该文件为准。
- 本文只说明部署拓扑、环境变量差异、Nginx 回源和运维命令，不复制 Compose 全量配置。
- 如果 Compose 文件与本文说明冲突，优先修正本文。

说明：

- 这是全 Docker Compose 场景专用文件，不覆盖当前根目录 `docker-compose.yml`。
- `DATABASE_URL` 使用 Compose 服务名 `postgres`。
- `REDIS_URL` 使用 Compose 服务名 `redis`。
- PostgreSQL、API、payment-api 与 Worker 均固定 `TZ=UTC`；数据库事件时间字段使用 `timestamptz(3)`。
- 前端静态资源挂载到 Nginx 容器目录。
- 以上 `nginx` 服务示例与根目录 [nginx.conf](../../nginx.conf) 成对使用。

## 5. env 示例

根目录 `.env` 示例见 [env.md](./env.md) 的“阿里云全 Docker Compose 示例”。

核心差异：

```env
DATABASE_URL=postgresql://shou_user:<PostgreSQL强密码>@postgres:5432/shou_db?schema=public
REDIS_URL=redis://:<Redis强密码>@redis:6379
```

不要使用 `host.docker.internal`。

## 6. Nginx 配置

根目录 [nginx.conf](../../nginx.conf) 与本场景成对使用。

当前配置约定：

- `5001`：平台运营台内层入口
- `5002`：租户工作台内层入口
- `5003`：C 端 H5 内层入口
- 三个前端站点都支持 `/api/` 代理；`/api/pay/` 与 `/api/payment/webhook/` 转发到 `payment-api:3001`，其他 `/api/` 转发到 `api:3000`
- 三个前端站点都使用 `try_files $uri $uri/ /index.html;` 处理 SPA 路由
- 仅租户工作台入口 `5002` 的 `/api/import/preview` 单独启用 `client_max_body_size 21m`；正式导入只消费 `previewId`，不放大站点或其他接口请求体限制

外层网关回源建议：

| 外层域名           | 回源地址                 |
| ------------------ | ------------------------ |
| `mp.shoudanba.cn`  | `http://<宿主机IP>:5001` |
| `www.shoudanba.cn` | `http://<宿主机IP>:5002` |
| `h5.shoudanba.cn`  | `http://<宿主机IP>:5003` |
| `api.shoudanba.cn` | `http://<宿主机IP>:3000` |

说明：

- `proxy_pass http://api:3000;` 依赖 Compose 服务名 `api`，只在 Nginx 容器与 API 容器处于同一个 Compose 网络时成立。
- 内层 Nginx 不处理证书，因此 `nginx.conf` 中没有 `443 ssl` 配置。
- 如果你的真实域名不是以上四个，最外层网关按实际域名回源即可，内层 `server_name _;` 不受影响。

## 7. 前端静态资源目录

建议服务器上准备：

```text
deploy/frontend/admin
deploy/frontend/tenant
deploy/frontend/pay-h5
```

把前端 `dist` 内部文件分别放入对应目录。

示例：

```bash
mkdir -p deploy/frontend/admin deploy/frontend/tenant deploy/frontend/pay-h5
```

上传时注意：

- 上传 `dist` 内部文件，不要额外再套一层 `dist`
- `deploy/frontend/admin` 对应平台运营台
- `deploy/frontend/tenant` 对应租户工作台
- `deploy/frontend/pay-h5` 对应 C 端 H5

## 8. 启动

```bash
docker compose -f docker-compose.full.yml up -d --build
```

查看状态：

```bash
docker compose -f docker-compose.full.yml ps
```

查看日志：

```bash
docker compose -f docker-compose.full.yml logs -f api
docker compose -f docker-compose.full.yml logs -f import-worker
docker compose -f docker-compose.full.yml logs -f nginx
```

如果只修改了 `nginx.conf`，可单独重启：

```bash
docker compose -f docker-compose.full.yml restart nginx
```

## 9. 初始化数据

```bash
docker exec -it shou-api-server node scripts/db-seed.js
```

或最小初始化：

```bash
docker exec -it shou-api-server node scripts/db-init.js
```

## 10. 备份建议

PostgreSQL：

```bash
docker exec shou-postgres pg_dump -U ${POSTGRES_USER} ${POSTGRES_DB} > shou_db.sql
```

Redis：

```bash
docker exec shou-redis redis-cli -a ${REDIS_PASSWORD} BGSAVE
```

同时应备份：

- `.env`
- `deploy/frontend`
- Docker volumes
- 外层网关配置与证书

## 11. 适用边界

选择本方案意味着：

- 你要自己维护 Docker Compose、数据库、Redis 和应用容器。
- 你仍然需要一个最外层 Nginx / SLB / 网关来统一处理 HTTPS 与证书。
- 内层 `shou-nginx` 不是公网 HTTPS 入口，只是应用分发层。

如果你已经在使用 1Panel，优先使用 [aliyun-with-1panel.md](./aliyun-with-1panel.md)。
