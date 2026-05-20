# 阿里云单机 ECS 部署：1Panel + Docker

> 日期：2026-05-14
> 适用范围：单机 ECS、1Panel 托管 PostgreSQL / Redis / OpenResty，Docker Compose 仅运行 `api` 与 `import-worker`

本文档是通用部署与运维手册，不承载某一次具体数据库迁移的 SQL 和过程性执行记录。

## 1. 目标形态

- 1Panel 托管 PostgreSQL、Redis、OpenResty
- OpenResty 对外提供 HTTPS 与反向代理
- Docker Compose 只启动 `api` 与 `import-worker`
- 不使用 PM2
- 应用部署与数据库迁移分离

## 2. 当前编排口径

根目录 [docker-compose.yml](../../docker-compose.yml) 是本场景使用的编排文件。

它只包含：

- `shou-api`
- `shou-import-worker`

它不包含：

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
  |-- mp.shoudanba.cn  -> 前端静态资源
  |-- www.shoudanba.cn -> 前端静态资源
  |-- h5.shoudanba.cn  -> 前端静态资源
  |-- api.shoudanba.cn -> http://127.0.0.1:3000
                              |
                              v
                       Docker: shou-api
                              |
                              +--> host.docker.internal:5432 PostgreSQL
                              +--> host.docker.internal:6379 Redis

Docker: shou-import-worker -> PostgreSQL / Redis
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
docker compose logs -f import-worker
```

说明：

- 当前生产镜像启动时不会自动执行 `prisma db push`
- 数据库结构必须在发布前显式迁移

## 10. 初始化数据

首次部署后执行：

```bash
docker exec -it shou-api node scripts/db-seed.js
```

如果只想初始化最小管理员数据：

```bash
docker exec -it shou-api node scripts/db-init.js
```

## 11. 配置 API 反向代理

在 1Panel 中为 `api.shoudanba.cn` 创建反向代理站点。

目标地址：

```text
http://127.0.0.1:3000
```

原因：

- `docker-compose.yml` 将容器 `3000` 映射到宿主机 `127.0.0.1:3000`
- API 不直接暴露公网
- OpenResty 通过本机回源访问 API

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

每个前端静态站点都需要配置：

```nginx
location ^~ /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

location / {
    try_files $uri $uri/ /index.html;
}
```

尤其是 H5 的 `/pay/:token`，不配置会导致扫码直开 404。

## 14. 日常更新

不涉及数据库迁移的纯应用更新：

```bash
cd /data/www/api
git pull
docker compose up -d --build api
docker compose up -d --build import-worker
```

## 15. 涉及数据库迁移的更新

如果本次发布包含数据库结构变更，不要直接 `docker compose up -d --build`。

请按下面顺序执行：

1. 确认当前生产代码基线和目标版本。
2. 备份生产数据库。
3. 停止 `import-worker`，必要时同时停止 `api`。
4. 执行本次发布对应且已评审的迁移 SQL。
5. 校验表结构、枚举和关键数据。
6. 更新并启动 `api`。
7. 验证登录、订单列表、导入、支付等关键链路。
8. 恢复 `import-worker`。

## 16. 验证

后端：

```bash
curl http://127.0.0.1:3000/api/docs
curl https://api.shoudanba.cn/api/docs
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
docker compose logs -f import-worker
docker compose restart api
docker compose restart import-worker
docker compose stop import-worker
docker compose up -d import-worker
docker compose down
docker compose up -d --build
```

## 18. 本场景不使用的文件

根目录 `nginx.conf` 不参与本场景。

它只作为无 1Panel、全 Docker Compose 场景下的 Nginx 参考配置。
