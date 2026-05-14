# 本地 Mac 开发排查纪要

更新时间：2026-03-29 10:54:29 CST

## 1. 本次问题背景

在本地 Mac 电脑上运行项目时，执行以下命令出现 Prisma 访问数据库失败：

```bash
pnpm --filter api prisma:push
pnpm db:seed
```

典型报错如下：

```text
P1010: User `postgres` was denied access on the database `shou.public`
```

以及：

```text
User `postgres` was denied access on the database `shou.public`
```

## 2. 排查后的真实原因

这次问题不是单一原因，而是两层问题叠加。

### 2.1 数据库实例混用

项目仓库中的 [apps/api/.env](/Users/virgo/Documents/github/sinhe/apps/api/.env) 最初使用的是：

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/shou?schema=public"
```

这套配置默认假设本地数据库是 Windows 裸装 PostgreSQL，且存在：

- 用户：`postgres`
- 密码：`postgres`
- 数据库：`shou`

但当前这台 Mac 电脑上，本机数据库是 Homebrew 安装的 PostgreSQL 18，实际情况是：

- 本机角色只有 `virgo`
- 不存在 `postgres` 角色
- 原本也没有 `shou` 数据库
- `localhost` 访问使用的是本机 Homebrew PostgreSQL，不是 Docker 容器里的 PostgreSQL

因此 Prisma 连接串里的 `postgres` 并不匹配本机实例。

### 2.2 使用 `sudo pnpm ...` 带来的权限副作用

后续又执行过带 `sudo` 的 pnpm/Prisma 命令，导致工作区部分依赖目录所有权变成 `root`，典型现象是：

```text
EACCES: permission denied, unlink '.../.prisma/client/index.d.ts'
```

这说明数据库已经能连上了，但 Prisma 在自动生成客户端文件时因为文件权限异常而失败。

## 3. 本机 Homebrew PostgreSQL 的确认结果

通过 `psql`、`brew services` 和配置文件确认到以下事实：

- Homebrew PostgreSQL 版本：`18`
- 服务状态：`started`
- 数据目录：`/opt/homebrew/var/postgresql@18`
- `pg_hba.conf` 路径：`/opt/homebrew/var/postgresql@18/pg_hba.conf`
- localhost 认证方式：`trust`

本机数据库中确认到：

- 角色 `postgres` 不存在
- 角色 `virgo` 存在，并且是超级用户
- `shou` 初始不存在

## 4. 已执行的修复

### 4.1 修正 API 本地连接串

本地 [apps/api/.env](/Users/virgo/Documents/github/sinhe/apps/api/.env) 已调整为：

```env
DATABASE_URL="postgresql://virgo@localhost:5432/shou?schema=public"
```

### 4.2 创建本机数据库

已创建本地数据库：

```bash
createdb shou
```

### 4.3 验证数据库写入

以下命令已经验证通过：

```bash
pnpm --filter api prisma:push
pnpm db:seed
```

结果说明：

- Prisma 表结构已成功落库
- 种子数据已成功插入
- 数据库链路本身已经打通

### 4.4 Prisma generate 的剩余问题

虽然数据库正常，但执行：

```bash
pnpm --filter api prisma:generate
```

仍报：

```text
EACCES: permission denied, unlink '.../.prisma/client/index.d.ts'
```

这个问题属于 `sudo` 造成的 `node_modules` 权限问题，不是数据库连接问题。

## 5. Docker PostgreSQL 和 Homebrew PostgreSQL 的关系

两者不是同一个实例，也不存在“自动托管”关系。

### Homebrew PostgreSQL

- 运行在 macOS 本机
- 由 `brew services` 管理
- 数据目录在本机文件系统中
- 当前版本为 PostgreSQL 18

### Docker PostgreSQL

- 运行在容器中
- 镜像为 `postgres:15-alpine`
- 数据存储在 Docker volume 中
- 当前项目容器名为 `shou-db`

结论：

- 它们是同一种数据库软件，但不是同一台数据库
- 不共享角色、密码、数据库、数据目录
- 不会发生“brew 的 PG18 自动托管 docker 的 PG15”
- 真正发生的是端口监听冲突或访问路径混淆

## 6. 如何判断当前 `5432` 连到的是哪一个实例

### 6.1 看宿主机谁在监听

```bash
lsof -nP -iTCP:5432 -sTCP:LISTEN
```

### 6.2 看 Docker 是否对外映射了 5432

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

### 6.3 看 Homebrew PostgreSQL 是否启动

```bash
brew services list | rg postgres
```

### 6.4 用 TCP 方式直接问数据库自己是谁

注意必须写 `-h 127.0.0.1 -p 5432`，否则 `psql` 默认可能会走 Unix socket。

```bash
psql -h 127.0.0.1 -p 5432 -U virgo -d postgres -c "show data_directory;"
psql -h 127.0.0.1 -p 5432 -U virgo -d postgres -c "select version();"
```

判断方式：

- 返回 `/opt/homebrew/var/postgresql@18`，说明连到的是 Homebrew PostgreSQL
- 返回 `/var/lib/postgresql/data`，说明连到的是 Docker 容器 PostgreSQL

### 6.5 本次实际判断结果

根据本次排查结果：

- `127.0.0.1:5432` 实际落到的是本机 Homebrew PostgreSQL
- 原因是本机 `postgres` 角色不存在，而访问 `127.0.0.1:5432` 时返回了 `role "postgres" does not exist`
- 这与 Docker 容器中的 `postgres/postgres` 默认配置不一致，反而与本机 Homebrew 实例完全一致

## 7. DBeaver 连接项目 Docker PostgreSQL 的方式

项目 Docker PostgreSQL 容器环境变量确认如下：

- `POSTGRES_USER=postgres`
- `POSTGRES_PASSWORD=postgres`
- `POSTGRES_DB=shou`

如果 Docker 容器实际占用的是宿主机 `5432`，则 DBeaver 可使用：

- Host：`127.0.0.1`
- Port：`5432`
- Database：`shou`
- Username：`postgres`
- Password：`postgres`

但如果本机 Homebrew PostgreSQL 同时启动，也占用相关地址，则很容易连错实例。

更稳妥的做法是给 Docker PostgreSQL 改宿主机端口，例如：

```yaml
ports:
  - '5433:5432'
```

这样可以明确区分：

- `5432` = 本机 Homebrew PostgreSQL
- `5433` = 项目 Docker PostgreSQL

## 8. 项目 Docker 服务访问地址

当前项目前端访问端口实际为：

- OS 运营台：`http://localhost:5001`
- 租户工作台：`http://localhost:5002`
- C 端收款 H5：`http://localhost:5003`

注意：

- API 容器没有直接把 `3000` 映射到宿主机
- 前端通过 Nginx 反向代理访问 API
- 实际端口以 [docker-compose.yml](/Users/virgo/Documents/github/sinhe/docker-compose.yml) 和 [deploy/nginx.conf](/Users/virgo/Documents/github/sinhe/deploy/nginx.conf) 为准

## 9. Docker 容器停止方式

本次还确认了两种命令的差异：

### 9.1 只停止服务但保留容器

```bash
docker compose stop
```

作用：

- 停止容器运行
- 容器仍然保留
- 后续可以直接 `docker compose start`

### 9.2 停止并移除容器

```bash
docker compose down
```

作用：

- 停止容器
- 删除容器
- 网络也会一并清理

如果只是本机暂时不想让服务常驻，正确做法应使用：

```bash
docker compose stop
```

## 10. 后续建议

- 本地开发尽量不要使用 `sudo pnpm ...`
- 本机 Homebrew PostgreSQL 和 Docker PostgreSQL 最好分配不同宿主机端口
- 若要长期用 Docker 作为本地开发数据库，建议将项目数据库映射为 `5433:5432`
- 若 Prisma generate 继续报 `EACCES`，优先修复工作区 `node_modules` 所有权

## 11. 常用命令备忘

```bash
# 查看当前运行中的容器
docker ps

# 查看所有容器，包括已停止
docker ps -a

# 停止但不删除容器
docker compose stop

# 重新启动已存在的容器
docker compose start

# 停止并删除容器
docker compose down

# 查看 5432 谁在监听
lsof -nP -iTCP:5432 -sTCP:LISTEN

# 查看 Homebrew PostgreSQL 状态
brew services list | rg postgres

# 查看 Docker 端口映射
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```
