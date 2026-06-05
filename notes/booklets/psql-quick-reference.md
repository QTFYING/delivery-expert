# psql 本地与服务器使用速查

适用场景：

- 需要用 `psql` 直接连接 PostgreSQL
- 需要快速查看库、表、字段、数据
- 需要在本地、阿里云或 Docker 环境中排查数据库问题

本文默认以当前项目数据库为例：

- 数据库：`shou_db`
- 用户：`postgres`
- 主机：`127.0.0.1`
- 端口：`5432`

## 1. 先明确一个原则

推荐优先使用已经加入环境变量的通用命令：

```powershell
psql
```

如果当前机器还没有把 `psql` 加入 `PATH`，再先定位本机安装位置，然后使用对应路径。

Windows 本机定位方式：

```powershell
Get-Command psql -ErrorAction SilentlyContinue
where.exe psql
```

说明：

- 文档不应依赖某台机器上的固定安装目录
- 不是项目运行时依赖
- 换一台电脑、换一个用户名、换到服务器环境后，最终路径都可能不同

## 2. 最常用的连接方式

### 2.1 连接到项目库

```powershell
psql -h 127.0.0.1 -U postgres -d shou_db
```

如果提示输入密码，就输入当前 PostgreSQL 用户密码。

### 2.2 连接到系统库

当你要创建数据库、删除数据库、查看实例级信息时，通常先连 `postgres` 库：

```powershell
psql -h 127.0.0.1 -U postgres -d postgres
```

### 2.3 不交互，直接执行一条 SQL

```powershell
psql -h 127.0.0.1 -U postgres -d shou_db -c "select now();"
```

### 2.4 适合脚本处理的无格式输出

```powershell
psql -h 127.0.0.1 -U postgres -d shou_db -t -A -c "select id, account from users;"
```

说明：

- `-t`：去掉表头和统计行
- `-A`：使用无对齐输出，便于脚本处理

## 3. 常用环境变量方式

如果你不想每次都输密码，可以先设置：

```powershell
$env:PGPASSWORD='postgres'
```

然后再执行：

```powershell
psql -h 127.0.0.1 -U postgres -d shou_db -c "select now();"
```

注意：

- `PGPASSWORD` 适合本地排查或临时会话
- 不建议把真实生产密码长期明文写进脚本

## 4. 日常最常用的 psql 内置命令

进入 `psql` 交互界面后，可以直接执行以下元命令：

### 4.1 查看当前数据库

```sql
\conninfo
```

### 4.2 查看所有数据库

```sql
\l
```

### 4.3 切换数据库

```sql
\c shou_db
```

### 4.4 查看所有表

```sql
\dt
```

### 4.5 查看某张表结构

```sql
\d users
```

### 4.6 查看更详细的表结构

```sql
\d+ users
```

### 4.7 查看所有 schema

```sql
\dn
```

### 4.8 退出 psql

```sql
\q
```

## 5. 结合当前项目最常用的 SQL

### 5.1 查看所有用户

```sql
select id, account, role, "tenantId"
from users
order by account;
```

### 5.2 查询 admin 用户

```sql
select id, account, role
from users
where account = 'admin';
```

### 5.3 查询租户用户

```sql
select id, account, role, "tenantId"
from users
where "tenantId" is not null
order by account;
```

### 5.4 查看有哪些业务表

```sql
select tablename
from pg_tables
where schemaname = 'public'
order by tablename;
```

### 5.5 查看表记录数

```sql
select count(*) from users;
select count(*) from tenants;
select count(*) from orders;
```

## 6. 和当前项目最相关的几个典型操作

### 6.1 创建数据库

通常连接 `postgres` 库执行：

```sql
create database shou_db;
```

命令行写法：

```powershell
psql -h 127.0.0.1 -U postgres -d postgres -c "create database shou_db;"
```

### 6.2 删除数据库

注意：

- 删除前不能连在目标库本身上
- 先连 `postgres` 库

如果 PostgreSQL 版本支持：

```sql
drop database shou_db with (force);
```

或者先踢掉连接再删：

```sql
select pg_terminate_backend(pid)
from pg_stat_activity
where datname = 'shou_db'
  and pid <> pg_backend_pid();

drop database shou_db;
```

### 6.3 查看当前谁连着某个数据库

```sql
select pid, usename, application_name, client_addr, state
from pg_stat_activity
where datname = 'shou_db';
```

### 6.4 判断当前连到的是哪一个 PostgreSQL 实例

```powershell
psql -h 127.0.0.1 -U postgres -d postgres -c "show data_directory;"
psql -h 127.0.0.1 -U postgres -d postgres -c "select version();"
```

这在“本机 PostgreSQL”和“Docker PostgreSQL”容易混淆时特别有用。

## 7. 用 psql 配合当前项目做排查

### 7.1 登录失败时，先看用户是否存在

```powershell
psql -h 127.0.0.1 -U postgres -d shou_db -c "select id, account, role from users order by account;"
```

### 7.2 看 admin 的 id

```powershell
psql -h 127.0.0.1 -U postgres -d shou_db -t -A -c "select id, account, role from users where account = 'admin';"
```

示例结果：

```text
fbff2d66-5388-47f6-bfa1-be4faa66ef51|admin|OS_SUPER_ADMIN
```

### 7.3 验证表是否已经由 Prisma 推好

```powershell
psql -h 127.0.0.1 -U postgres -d shou_db -c "\dt"
```

或者：

```sql
select tablename
from pg_tables
where schemaname = 'public'
order by tablename;
```

## 8. 本地、阿里云、Docker 三种环境怎么用

### 8.1 本地 Windows / macOS / Linux

优先使用：

```bash
psql -h 127.0.0.1 -U postgres -d shou_db
```

### 8.2 阿里云或其他 Linux 服务器

通常直接使用：

```bash
psql -h 127.0.0.1 -U postgres -d shou_db
```

如果 PostgreSQL 不在本机，而在内网其他地址，就把 `127.0.0.1` 换成实际地址。

### 8.3 PostgreSQL 跑在 Docker 容器里

如果宿主机没装 `psql`，也可以进入容器执行：

```bash
docker exec -it <postgres-container> psql -U postgres -d shou_db
```

例如当前项目如果容器名是 `shou-db`，可写成：

```bash
docker exec -it shou-db psql -U postgres -d shou_db
```

## 9. 几个容易踩的点

### 9.1 `psql` 找不到命令

说明：

- 客户端未安装
- 或已安装但未加入 `PATH`

处理方式：

- 优先把 `psql` 加入环境变量
- 临时也可用绝对路径执行

### 9.2 你连错数据库实例了

现象：

- 明明建了库，但查不到
- 用户或密码和预期不一致

处理方式：

- 用 `show data_directory;`
- 用 `select version();`
- 确认当前连的是本机实例还是 Docker 实例

### 9.3 双引号字段名

在本项目里，一些字段名是驼峰命名，例如：

- `"tenantId"`

所以 SQL 里需要写成：

```sql
select "tenantId" from users;
```

不能写成：

```sql
select tenantId from users;
```

## 10. 推荐的最小命令集

如果你只想记住最常用的几条，记这组就够了：

```powershell
psql -h 127.0.0.1 -U postgres -d shou_db
psql -h 127.0.0.1 -U postgres -d shou_db -c "\dt"
psql -h 127.0.0.1 -U postgres -d shou_db -c "select id, account, role from users order by account;"
psql -h 127.0.0.1 -U postgres -d postgres -c "create database shou_db;"
psql -h 127.0.0.1 -U postgres -d postgres -c "show data_directory;"
```
