# 经销商订单收款平台后端

本仓库是经销商订单收款平台的后端单仓项目，基于 `Turborepo`、`pnpm workspace` 与 `NestJS` 构建。

当前核心范围：

- `apps/api`：统一后端 API、`payment-api` 与 `import-worker` 的实现和运行入口，服务 Admin / Tenant / H5 三端。
- `packages/types`：枚举与接口结构投影。
- `packages/utils`：金额等纯工具函数。

## 仓库规则入口

本仓库的事实源顺序、编码边界、分层约定、文档同步规则与 agent 工作流统一维护在 [AGENTS.md](./AGENTS.md)。README 只维护项目概览、本地启动、常用脚本与部署入口，避免与仓库规则重复漂移。

## 目录概览

```text
.
├── apps/api                 # NestJS API、payment-api 与 import-worker
├── packages/types           # 枚举与接口结构投影
├── packages/utils           # 通用工具函数
├── docs/api                 # API 业务语义事实源
├── docs/architecture        # 已稳定的架构说明
├── docs/deployment          # 部署手册
├── notes                    # 非事实源笔记、接力文档、排障记录与方案草案
├── review                   # 评审报告与施工计划
├── scripts                  # 数据初始化脚本
├── AGENTS.md                # 智能代理约束
├── Dockerfile               # API / payment-api / Worker 镜像构建
└── docker-compose.yml       # 阿里云 + 1Panel 场景下的 API / payment-api / Worker 编排
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

本地变量模板以 `apps/api/.env.example` 为准；不同部署场景的变量说明见 [docs/deployment/env.md](./docs/deployment/env.md)。README 不重复维护变量清单，避免多处示例漂移。

### 4. 同步数据库与生成 Prisma Client

```bash
pnpm -F api prisma:push
pnpm -F api prisma:generate
```

### 5. 初始化数据

```bash
pnpm db:seed
```

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
