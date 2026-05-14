# 经销商订单收款平台后端

本仓库是经销商订单收款平台的后端单仓项目，基于 `Turborepo`、`pnpm workspace` 与 `NestJS` 构建。

当前核心范围：

- `apps/api`：统一后端 API，以及 `import-worker` 的主实现与运行入口，服务 Admin / Tenant / H5 三端。
- `packages/types`：枚举与接口结构投影。
- `packages/utils`：金额等纯工具函数。

## 共享层约定

新增工具代码时，优先按下面三条判断放置位置：

- 纯函数、无 Nest 依赖、可跨 app 复用的工具，放 `packages/utils`
- 依赖 Nest、Prisma、Config、HTTP 语义、Exception、Pipe、Filter 的工具，放 `apps/api/src/common`
- 只服务单个业务域的 helper、校验、映射、查询条件，留在对应业务域目录，不上提为共享

## 项目事实源

涉及接口、字段、枚举、状态机、数据模型时，按以下顺序判断：

1. `docs/api/*.md`
2. `packages/types/src/enums`
3. `packages/types/src/contracts`
4. `docs/prisma/data-model-reference.md`
5. `apps/api` 实现代码
6. Swagger / OpenAPI

补充说明：

- `docs/api` 定义业务语义、状态流转与字段含义。
- `enums` 定义闭集值。
- `contracts` 只做共享结构投影与消费，不独立发明语义。
- `data-model-reference` 只做建模同步。
- Swagger / OpenAPI 只作为传输结构与联调产物，不反向推动接口改义。
- `docs/architecture/`、`docs/deployment/`、`notes/`、`review/`、`docs/archived/` 只作背景参考，不作为编码事实源。

更多仓库级约束见 [AGENTS.md](./AGENTS.md)。

## 目录概览

```text
.
├── apps/api                 # NestJS API 与 import-worker
├── packages/types           # 枚举与接口结构投影
├── packages/utils           # 通用工具函数
├── docs/api                 # API 事实源
├── docs/architecture        # 已稳定的架构说明
├── docs/deployment          # 部署手册
├── docs/prisma              # 数据模型参考
├── notes                    # 非事实源笔记、接力文档、排障记录与方案草案
├── review                   # 评审报告与施工计划
├── scripts                  # 数据初始化脚本
├── AGENTS.md                # 智能代理约束
├── Dockerfile               # API / Worker 镜像构建
└── docker-compose.yml       # 阿里云 + 1Panel 场景下的 API / Worker 编排
```

## 本地无 Docker 快速启动

本节只覆盖最小本地开发路径：PostgreSQL 与 Redis 已在本机或局域网可访问，后端直接用 `pnpm dev:api` 启动。

### 1. 环境要求

- Node.js `>= 22`
- pnpm `>= 9`
- PostgreSQL
- Redis

### 2. 安装依赖

```bash
pnpm install
```

### 3. 准备环境变量

```bash
cp apps/api/.env.example apps/api/.env
```

本地最小配置示例：

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/shou_db?schema=public
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-with-local-secret
CORS_ORIGINS=http://localhost:5173,http://localhost:5001,http://localhost:5002,http://localhost:5003
PORT=3000
NODE_ENV=development
AUTH_COOKIE_SECURE=false
IMPORT_JOB_WORKER_ENABLED=false
```

### 4. 同步数据库与生成 Prisma Client

```bash
pnpm -F api prisma:push
pnpm -F api prisma:generate
```

### 5. 初始化数据

```bash
pnpm db:seed
```

默认测试账号：

- 平台账号：`admin` / `123456`
- 租户账号：`boss` / `123456`

### 6. 启动 API

```bash
pnpm dev:api
```

默认访问地址：

- API：`http://localhost:3000`
- Swagger：`http://localhost:3000/api/docs`

如果需要同时监听 `packages/types` 变更，可使用：

```bash
pnpm dev
```

如果需要验证正式导入任务，还需要额外启动 worker。当前 `pnpm dev:worker` 会在已有构建产物基础上启动 `import-worker` 入口，不是 watch 模式：

```bash
pnpm -F api build
pnpm dev:worker
```

## 常用脚本

| 命令                 | 说明                             |
| -------------------- | -------------------------------- |
| `pnpm dev:api`       | 构建 types 后启动 API 开发进程   |
| `pnpm dev`           | 同时启动 types 与 API 的开发监听 |
| `pnpm dev:worker`    | 基于当前构建产物启动导入 Worker  |
| `pnpm build`         | 构建全部 workspace               |
| `pnpm check:backend` | 后端构建、冒烟与回归检查         |
| `pnpm db:seed`       | 写入基础测试数据                 |
| `pnpm db:init`       | 初始化最小管理员数据             |

## 部署文档

不同环境请看对应文档：

- [部署总览](./docs/deployment/README.md)
- [环境变量手册](./docs/deployment/env.md)
- [开发机部署：PM2 + 1Panel 托管 PostgreSQL / Redis](./docs/deployment/dev-with-pm2-and-1panel.md)
- [阿里云生产：1Panel 托管 PostgreSQL / Redis / OpenResty](./docs/deployment/aliyun-with-1panel.md)
- [阿里云生产：无 1Panel，全 Docker Compose 编排](./docs/deployment/aliyun-full-docker-compose.md)
