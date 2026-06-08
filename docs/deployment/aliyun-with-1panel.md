# 阿里云单机 ECS 部署：1Panel + Docker

> 日期：2026-05-14
> 适用范围：单机 ECS、1Panel 托管 PostgreSQL / Redis / OpenResty，Docker Compose 仅运行 `api`、`payment-api` 与 `import-worker`

本文档是通用部署与运维手册，不承载某一次具体数据库迁移的 SQL 和过程性执行记录。

## 1. 目标形态

- 1Panel 托管 PostgreSQL、Redis、OpenResty
- OpenResty 对外提供 HTTPS 与反向代理
- Docker Compose 只启动 `api`、`payment-api` 与 `import-worker`
- 不使用 PM2
- 应用部署与数据库迁移分离

## 2. 当前编排口径

根目录 [docker-compose.yml](../../docker-compose.yml) 是本场景使用的编排文件。

后端服务清单、容器名、端口和环境变量转发以根目录 [docker-compose.yml](../../docker-compose.yml) 为准。

当前该编排不包含：

- PostgreSQL
- Redis
- Nginx / OpenResty

不要为了本场景修改 `docker-compose.yml` 添加数据库或 OpenResty。

## 3. 部署拓扑

```text
公网用户
  |
  v
1Panel OpenResty
  |-- mp.shoudanba.cn  -> 前端静态资源，仅 SPA 回退
  |-- www.shoudanba.cn -> 前端静态资源，仅 SPA 回退
  |-- h5.shoudanba.cn  -> 前端静态资源，仅 SPA 回退
  |-- api.shoudanba.cn
        |-- /api/pay/              -> http://127.0.0.1:3001
        |-- /api/payment/webhook/  -> http://127.0.0.1:3001
        |-- /api/import/preview    -> http://127.0.0.1:3000，单独放大请求体
        |-- 其他请求               -> http://127.0.0.1:3000

Docker: api          -> host.docker.internal:5432 PostgreSQL / 6379 Redis
Docker: payment-api  -> host.docker.internal:5432 PostgreSQL / 6379 Redis
Docker: import-worker -> host.docker.internal:5432 PostgreSQL / 6379 Redis
```

## 4. 单机边界

单机 ECS 可以做到低感知上线，但不能保证真正零停机。

原因：

- 只有一台宿主机
- 只有一套 PostgreSQL
- API 容器重建时仍会有极短抖动

因此本文档目标是：

- 把数据库迁移影响降到最小
- 把 API 更新窗口压到最短
- 避免“容器启动自动改库”这类不可控行为

## 5. 阿里云安全组

建议公网只开放：

| 端口  | 说明                     |
| ----- | ------------------------ |
| `22`  | SSH，建议限制固定 IP     |
| `80`  | HTTP，用于证书申请与跳转 |
| `443` | HTTPS                    |

不要向公网开放：

- `3000`
- `5432`
- `6379`

## 6. 服务器准备

确认软件版本：

```bash
docker --version
docker compose version
git --version
```

准备目录：

```bash
mkdir -p /data/www
cd /data/www
git clone <你的仓库地址> api
cd /data/www/api
```

如果已经拉过代码：

```bash
cd /data/www/api
git pull
```

## 7. 1Panel 准备基础设施

在 1Panel 中安装：

- PostgreSQL
- Redis
- OpenResty

建议：

- PostgreSQL 数据库名：`shou_db`
- PostgreSQL 不对公网开放
- Redis 不对公网开放
- OpenResty 负责全部域名与 HTTPS

确认宿主机监听：

```bash
ss -lntp | grep 5432
ss -lntp | grep 6379
```

## 8. 准备根目录 `.env`

在 `/data/www/api/.env` 写入生产变量。

示例见 [env.md](./env.md) 的“阿里云 + 1Panel 生产示例”。

最小结构：

```env
DATABASE_URL=postgresql://<PostgreSQL用户名>:<PostgreSQL密码>@host.docker.internal:5432/shou_db?schema=public
REDIS_URL=redis://:<Redis密码>@host.docker.internal:6379
JWT_SECRET=<生产随机密钥>
CORS_ORIGINS=https://mp.shoudanba.cn,https://www.shoudanba.cn,https://h5.shoudanba.cn
AUTH_COOKIE_SECURE=true
LAKALA_BASE_URL=https://s2.lakala.com
LAKALA_APP_ID=<拉卡拉应用ID>
LAKALA_SERIAL_NO=<拉卡拉证书序列号>
LAKALA_PRIVATE_KEY="<拉卡拉商户私钥，使用 \n 保留换行>"
LAKALA_PLATFORM_PUBLIC_KEY="<拉卡拉平台公钥，使用 \n 保留换行>"
LAKALA_NOTIFY_URL=https://api.shoudanba.cn/api/payment/webhook/lakala
```

## 9. 首次部署

构建并启动：

```bash
cd /data/www/api
docker compose up -d --build
```

查看状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f api
docker compose logs -f payment-api
docker compose logs -f import-worker
```

说明：

- 当前生产镜像启动时不会自动执行 `prisma db push`
- 数据库结构必须在发布前显式迁移

## 10. 初始化数据

首次部署后执行：

```bash
docker exec -it shou-api-server node scripts/db-seed.js
```

如果只想初始化最小管理员数据：

```bash
docker exec -it shou-api-server node scripts/db-init.js
```

## 11. 配置 API 反向代理

在 1Panel 中为 `api.shoudanba.cn` 创建反向代理站点。该站点承接所有 API 域名流量，前端静态站点不要再分散配置 `/api/` 代理。

当前路由口径：

```text
/api/pay/              -> http://127.0.0.1:3001
/api/payment/webhook/  -> http://127.0.0.1:3001
/api/import/preview    -> http://127.0.0.1:3000，client_max_body_size 21m
其他请求               -> http://127.0.0.1:3000
```

推荐在 `api.shoudanba.cn` 的 OpenResty 配置中保留更具体的 location，再用根代理兜底：

```nginx
location ^~ /api/pay/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header REMOTE-HOST $remote_addr;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $http_connection;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Port $server_port;
    proxy_http_version 1.1;
}

location ^~ /api/payment/webhook/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header REMOTE-HOST $remote_addr;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $http_connection;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Port $server_port;
    proxy_http_version 1.1;
}

location ^~ /api/import/preview {
    client_max_body_size 21m;
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header REMOTE-HOST $remote_addr;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $http_connection;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Port $server_port;
    proxy_http_version 1.1;
}

location ^~ / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header REMOTE-HOST $remote_addr;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $http_connection;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Port $server_port;
    proxy_http_version 1.1;
}
```

说明：

- `docker-compose.yml` 将 `api` 映射到宿主机 `127.0.0.1:3000`，将 `payment-api` 映射到宿主机 `127.0.0.1:3001`
- H5 支付公开接口和支付回调应进入 `payment-api`，不要依赖主 API 的兼容兜底
- 只有 `POST /api/import/preview` 需要放大请求体；正式导入 `POST /api/orders/import` 只消费 `previewId`，不需要单独放大
- OpenResty 使用最长前缀匹配，更具体的 `/api/pay/`、`/api/payment/webhook/` 和 `/api/import/preview` 会优先于根代理

## 12. 部署前端静态资源

前端打包后，把 `dist` 内部文件上传到 1Panel 自动创建的站点运行目录。

常见目录：

```text
/opt/1panel/www/sites/<domain>/index
```

示例：

| 域名               | 建议用途   | 静态目录                             |
| ------------------ | ---------- | ------------------------------------ |
| `mp.shoudanba.cn`  | 平台运营台 | `/opt/1panel/www/sites/admin/index`  |
| `www.shoudanba.cn` | 租户工作台 | `/opt/1panel/www/sites/tenant/index` |
| `h5.shoudanba.cn`  | C 端 H5    | `/opt/1panel/www/sites/h5/index`     |

上传规则：

- 上传 `dist` 里面的文件
- 不要在运行目录下再套一层 `dist`
- 如果 1Panel 中运行目录不是 `index`，以 1Panel 页面显示为准

## 13. 前端 SPA 回退

每个前端静态站点只配置 SPA 回退，不配置 `/api/` 反向代理：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

说明：

- 前端 API root 使用 `https://api.shoudanba.cn`，接口流量不经过 `mp.shoudanba.cn`、`www.shoudanba.cn`、`h5.shoudanba.cn`
- 前端静态站点只负责页面刷新不 404，复杂 API 转发规则统一放在 `api.shoudanba.cn`
- H5 页面路径 `/pay/:token` 属于前端路由；H5 支付接口 `/api/pay/:token` 属于 API 域名路由，两者不要混淆

## 14. 日常更新

不涉及数据库迁移的纯应用更新：

```bash
cd /data/www/api
git pull
docker compose up -d --build api
docker compose up -d --force-recreate payment-api
docker compose up -d --force-recreate import-worker
```

说明：

- `api` 是唯一带 `build` 配置的服务，会构建新的 `shou-backend:latest` 镜像
- `payment-api` 与 `import-worker` 复用同一个镜像，通过不同 `command` 启动，更新后需要显式重建容器以吃到新镜像

## 15. 涉及数据库迁移的更新

如果本次发布包含数据库结构变更，不要直接 `docker compose up -d --build`。

请按下面顺序执行：

1. 确认当前生产代码基线和目标版本。
2. 备份生产数据库。
3. 停止 `import-worker`，必要时同时停止 `api`。
4. 执行本次发布对应且已评审的迁移 SQL。
5. 校验表结构、枚举和关键数据。
6. 更新并启动 `api` 与 `payment-api`。
7. 验证登录、订单列表、导入、支付等关键链路。
8. 恢复 `import-worker`。

## 16. 验证

后端：

```bash
curl http://127.0.0.1:3000/api/docs
curl http://127.0.0.1:3001/api/pay/<qrCodeToken>
curl https://api.shoudanba.cn/api/docs
curl https://api.shoudanba.cn/api/pay/<qrCodeToken>
```

OpenResty 生效配置：

```bash
docker exec openresty nginx -T 2>&1 | grep -n -A25 -B5 "/api/pay/"
docker exec openresty nginx -T 2>&1 | grep -n -A25 -B5 "/api/import/preview"
```

前端：

- 打开 `https://mp.shoudanba.cn`
- 打开 `https://www.shoudanba.cn`
- 打开 `https://h5.shoudanba.cn`
- 刷新任意二级路由，确认不是 404
- 打开 H5 `/pay/<qrCodeToken>`，确认能进入页面

业务链路：

- 登录
- 订单列表
- 导入模板列表
- 导入预检
- 正式导入
- 打印配置读取
- H5 支付状态查询

## 17. 常用运维命令

```bash
docker compose ps
docker compose logs -f api
docker compose logs -f payment-api
docker compose logs -f import-worker
docker compose restart api
docker compose restart payment-api
docker compose restart import-worker
docker compose stop import-worker
docker compose up -d import-worker
docker compose up -d --build api
docker compose up -d --force-recreate payment-api
docker compose down
docker compose up -d --build
```

## 18. 本场景不使用的文件

根目录 `nginx.conf` 不参与本场景。

它只作为无 1Panel、全 Docker Compose 场景下的 Nginx 参考配置。
1Panel 场景中的 API 反向代理以 1Panel/OpenResty 站点配置为准，不复制根目录 `nginx.conf`。
