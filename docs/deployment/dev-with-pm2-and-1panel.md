# 开发机部署：PM2 + 1Panel

> 日期：2026-04-22
> 适用范围：本文档适用于开发机器上的长期自启环境

目标形态：

- PostgreSQL / Redis 由 1Panel 安装并托管，本质是 Docker 容器。
- API 与 import-worker 由 PM2 守护。
- 前端可走本地 dev server，也可把静态资源交给 1Panel OpenResty 托管。
- 不使用根目录 `docker-compose.yml` 启动 API。

## 1. 拓扑

```text
浏览器 / 前端 dev server
        |
        v
PM2: shou-api -> localhost:3000
        |
        +--> PostgreSQL: localhost:5432
        +--> Redis: localhost:6379

PM2: shou-import-worker
        |
        +--> PostgreSQL / Redis
```

## 2. 前置条件

- Node.js `>= 22`
- pnpm `>= 9`
- PM2
- 1Panel
- 1Panel 中已安装 PostgreSQL 与 Redis

安装 PM2：

```bash
pnpm add -g pm2
```

## 3. 1Panel 准备 PostgreSQL / Redis

在 1Panel 应用商店中安装：

- PostgreSQL
- Redis

建议：

- PostgreSQL 数据库名：`shou_db`
- PostgreSQL 端口：`5432`
- Redis 端口：`6379`
- 密码使用 1Panel 生成的强密码

确认宿主机可访问：

```bash
psql "postgresql://<user>:<password>@localhost:5432/shou_db"
redis-cli -a <redis-password> ping
```

如果本机没有安装 `psql` 或 `redis-cli`，也可以在 1Panel 应用页面查看运行状态。

## 4. 准备 apps/api/.env

复制模板：

```bash
cp apps/api/.env.example apps/api/.env
```

按 [env.md](./env.md) 中“开发机 PM2 + 1Panel 示例”填写：

```env
DATABASE_URL=postgresql://<PostgreSQL用户名>:<PostgreSQL密码>@localhost:5432/shou_db?schema=public
REDIS_URL=redis://:<Redis密码>@localhost:6379
JWT_SECRET=<本机开发密钥>
CORS_ORIGINS=http://localhost:5173,http://localhost:5001,http://localhost:5002,http://localhost:5003
PORT=3000
NODE_ENV=development
AUTH_COOKIE_SECURE=false
IMPORT_JOB_WORKER_ENABLED=false
```

## 5. 初始化项目

```bash
pnpm install
pnpm -F api prisma:push
pnpm -F api prisma:generate
pnpm db:seed
pnpm -F @shou/types build
pnpm -F api build
```

说明：

- `pnpm -F api build` 是为了让 `shou-import-worker` 有可运行的 `dist/import-worker.main`。
- 如果暂时不跑 Worker，可以先不启动 Worker。

备注：
由于 sudo 执行时生成了新的 Prisma Client 文件（位于 node_modules/.prisma/client ），这些文件现在属于 root 用户，会导致IDE报错。

```shell
# 1. 恢复整个项目目录及 node_modules 的用户权限
sudo chown -R $(whoami) .

# 2. 重新生成一次 Prisma Client 并重新编译
cd apps/api && npx prisma generate && cd ../.. && pnpm build
```

## 6. 使用 PM2 启动

项目根目录已有 `ecosystem.config.js`。

启动：

```bash
pm2 start ecosystem.config.js
```

查看：

```bash
pm2 list
pm2 logs shou-api
pm2 logs shou-import-worker
```

停止：

```bash
pm2 stop all
```

重启：

```bash
pm2 restart all
```

如果不需要导入 Worker：

```bash
pm2 stop shou-import-worker
```

## 7. 开机自启

```bash
pm2 save
pm2 startup
```

执行 `pm2 startup` 后，按终端输出的命令再执行一次即可。

## 8. 前端静态资源

开发机如果也使用 1Panel 托管前端静态资源，建议直接使用 1Panel 自动创建的站点目录。

常见目录：

```text
/opt/1panel/www/sites/<domain>/index
```

部署时上传的是前端 `dist` 目录内部文件，不是把整个 `dist` 目录套进去。

SPA 站点必须配置：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

## 9. 验证

```bash
curl http://localhost:3000/api/docs
```

浏览器打开：

```text
http://localhost:3000/api/docs
```

重点验证：

- 登录
- 订单列表
- 导入模板列表
- 导入预检
- 正式导入与 Worker 消费

## 10. 常见问题

### PM2 启动后 API 找不到数据库

检查 `apps/api/.env` 是否使用了 `localhost`，以及 1Panel 中 PostgreSQL 是否正在运行。

### 修改 Worker 代码后不生效

Worker 运行编译产物，修改后需要：

```bash
pnpm -F api build
pm2 restart shou-import-worker
```

### 前端刷新二级路由 404

OpenResty 未配置 `try_files $uri $uri/ /index.html;`。
