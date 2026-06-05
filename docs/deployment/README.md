# 部署总览

本文档是部署入口页。不同环境只看对应场景，不要混用命令和目录。

## 场景选择

| 场景                   | 适用对象                                                   | 阅读文档                                                         |
| ---------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| 本地无 Docker 快速开发 | 只想在本机直接跑 API                                       | [README.md](../../README.md)                                     |
| 开发机长期自启         | 开发机使用 PM2，PostgreSQL / Redis 由 1Panel 托管          | [dev-with-pm2-and-1panel.md](./dev-with-pm2-and-1panel.md)       |
| 阿里云生产主方案       | 1Panel 托管 PostgreSQL / Redis / OpenResty，后端容器化部署 | [aliyun-with-1panel.md](./aliyun-with-1panel.md)                 |
| 阿里云无 1Panel        | Nginx / PostgreSQL / Redis / 后端全部由 Compose 编排       | [aliyun-full-docker-compose.md](./aliyun-full-docker-compose.md) |
| 环境变量               | 生成 `.env`、`JWT_SECRET`、连接串                          | [env.md](./env.md)                                               |

## 当前仓库默认口径

当前根目录 [docker-compose.yml](../../docker-compose.yml) 是 **阿里云 + 1Panel** 场景的编排文件，具体服务、端口与环境变量以该文件为准。

如果使用“无 1Panel，全 Docker Compose”场景，不要直接改现有 `docker-compose.yml` 覆盖主方案。建议另建 `docker-compose.full.yml`，具体见 [aliyun-full-docker-compose.md](./aliyun-full-docker-compose.md)。

## 文件边界

- `README.md`：项目概况与本地无 Docker 快速启动。
- `docs/deployment/*.md`：部署方案。
- `apps/api/.env.example`：API 本地开发变量模板。
- 根目录 `.env`：Docker Compose 读取的生产变量文件，不提交 Git。
- `nginx.conf`：仅作为“无 1Panel，全 Docker Compose”场景的 Nginx 参考配置，在 1Panel 场景中不生效。

## 推荐上线顺序

1. 先确认部署场景。
2. 按 [env.md](./env.md) 生成对应 `.env`。
3. 准备 PostgreSQL 与 Redis。
4. 如涉及结构变更，先备份数据库，停写入型 Worker，执行经评审的迁移 SQL，再更新应用。
5. 启动或更新后端服务。
6. 配置前端静态资源和反向代理。
7. 验证 Swagger、登录、订单列表、导入预检、正式导入、H5 支付入口。
