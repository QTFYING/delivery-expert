# ============================================
# Stage 1: 安装依赖
# ============================================
FROM node:22-alpine AS deps

# Prisma 引擎依赖 OpenSSL（build 阶段 prisma generate 也需要）
RUN apk add --no-cache openssl

# 配置国内镜像源（解决阿里云服务器无法访问 npmjs.org）
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
RUN corepack enable


WORKDIR /app


# 先复制 pnpm 配置和所有 package.json，利用 Docker 缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json .npmrc ./

# apps
COPY apps/api/package.json apps/api/

# packages
COPY packages/types/package.json packages/types/
COPY packages/utils/package.json packages/utils/

RUN pnpm install --frozen-lockfile

# ============================================
# Stage 2: 构建全部应用
# ============================================
FROM deps AS build

COPY . .

# Prisma generate（生成客户端）
RUN pnpm --filter api prisma:generate

# Turbo 构建所有应用
RUN pnpm run build

# pnpm deploy 生成独立部署目录（无 symlink，node_modules 完整平铺）
RUN pnpm --filter api deploy --prod --legacy /deploy/api

# 防止本地环境变量文件被 pnpm deploy 带入运行时镜像
RUN rm -f /deploy/api/.env /deploy/api/.env.*

# 把 dist 和 prisma schema 复制进去
RUN cp -r /app/apps/api/dist /deploy/api/dist && \
    cp -r /app/apps/api/prisma /deploy/api/prisma

# 在 deploy 目录内重新生成 prisma client（确保路径正确）
RUN cd /deploy/api && node_modules/.bin/prisma generate

# ============================================
# Stage 3: API 运行时（精简镜像）
# ============================================
FROM node:22-alpine AS api

# Prisma 引擎依赖 OpenSSL
RUN apk add --no-cache openssl

WORKDIR /app

COPY --from=build /deploy/api ./
COPY --from=build /app/scripts ./scripts

EXPOSE 3000 3001

CMD ["node", "dist/main"]
