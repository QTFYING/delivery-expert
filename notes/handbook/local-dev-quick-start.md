# 本地开发快速指南

适用场景：

- 本机是 Mac
- 既可能装了 Homebrew PostgreSQL，也可能跑项目 Docker PostgreSQL
- 需要快速启动、停止、访问、排查

## 1. 常用启动命令

### 启动 Docker 项目服务

```bash
docker compose up -d
```

### 启动已存在但已停止的容器

```bash
docker compose start
```

### 停止容器但保留

```bash
docker compose stop
```

### 停止并删除容器

```bash
docker compose down
```

## 2. 当前项目访问地址

- OS 运营台：`http://localhost:5001`
- 租户工作台：`http://localhost:5002`
- C 端收款 H5：`http://localhost:5003`

说明：

- API 容器没有直接映射宿主机 `3000`
- 页面里的 `/api` 请求由 Nginx 反向代理到后端

## 3. 查看容器状态

### 查看运行中的容器

```bash
docker ps
```

### 查看全部容器，包括已停止

```bash
docker ps -a
```

### 推荐查看方式

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker ps -a --format 'table {{.Names}}\t{{.Status}}'
```

## 4. PostgreSQL 两套环境的区别

### Homebrew PostgreSQL

- 跑在 macOS 本机
- 通常由 `brew services` 管理
- 数据目录类似：`/opt/homebrew/var/postgresql@18`

### Docker PostgreSQL

- 跑在容器里
- 当前项目容器名：`shou-db`
- 容器内数据目录通常是：`/var/lib/postgresql/data`

结论：

- 它们不是同一个实例
- 不会互相托管
- 真正会发生的是端口冲突或连接混淆

## 5. 如何判断当前 `5432` 连到谁

### 看谁在监听

```bash
lsof -nP -iTCP:5432 -sTCP:LISTEN
```

### 看 Docker 是否映射了 `5432`

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

### 看 Homebrew PostgreSQL 是否启动

```bash
brew services list | rg postgres
```

### 用 TCP 明确检查实例归属

注意：一定要显式写 `-h 127.0.0.1 -p 5432`。

```bash
psql -h 127.0.0.1 -p 5432 -U virgo -d postgres -c "show data_directory;"
psql -h 127.0.0.1 -p 5432 -U virgo -d postgres -c "select version();"
```

判断方法：

- 返回 `/opt/homebrew/var/postgresql@18`，说明是 Homebrew PostgreSQL
- 返回 `/var/lib/postgresql/data`，说明是 Docker PostgreSQL

## 6. DBeaver 连接建议

如果 Docker PostgreSQL 独占宿主机 `5432`，可用：

- Host：`127.0.0.1`
- Port：`5432`
- Database：`shou_db`
- Username：`postgres`
- Password：`postgres`

如果本机也开着 Homebrew PostgreSQL，建议把 Docker PostgreSQL 映射改成：

```yaml
ports:
  - '5433:5432'
```

这样可以固定成：

- `5432` = 本机 PostgreSQL
- `5433` = Docker PostgreSQL

## 7. 本项目本地数据库说明

### Docker PostgreSQL 默认参数

- 用户：`postgres`
- 密码：`postgres`
- 数据库：`shou_db`

### 本机 Homebrew PostgreSQL 这次排查到的情况

- 角色为 `virgo`
- 原本不存在 `postgres` 角色
- 原本不存在 `shou_db` 数据库

## 8. Prisma 常见问题

### 报 `role "postgres" does not exist`

说明：

- 你连到的很可能不是 Docker PostgreSQL
- 而是本机 Homebrew PostgreSQL

### 报 `EACCES: permission denied`

说明：

- 多半是之前使用了 `sudo pnpm ...`
- 导致 `node_modules` 或 `.prisma` 文件所有权异常

建议：

- 本地开发尽量不要使用 `sudo pnpm ...`

## 9. 一组够用的排查命令

```bash
# 启动服务
docker compose up -d

# 停止服务但保留容器
docker compose stop

# 查看容器
docker ps
docker ps -a

# 查看数据库端口监听
lsof -nP -iTCP:5432 -sTCP:LISTEN

# 查看 Homebrew PostgreSQL
brew services list | rg postgres

# 查看 Docker 端口映射
docker ps --format 'table {{.Names}}\t{{.Ports}}'

# 判断当前 5432 到底连到谁
psql -h 127.0.0.1 -p 5432 -U virgo -d postgres -c "show data_directory;"
```

## 10. 延伸文档

更详细的排查纪要见：

[local_mac_postgres_docker_notes_2026-03-29.md](/Users/virgo/Documents/github/sinhe/docs/local_mac_postgres_docker_notes_2026-03-29.md)
