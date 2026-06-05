# OSS 通用上传中心与头像接入计划

> 日期：2026-06-04
> 状态：方案存档，尚未施工
> 范围：后端通用上传能力第一版，首个业务场景为用户头像

## 1. 背景与目标

本方案建设通用上传能力：后端按 `scene` 签发 OSS 直传凭证，前端直传 OSS，后端确认上传完成，业务接口再消费 `uploadId`

第一版只实现 `user_avatar`，但规则表按合同、附件等未来场景可扩展设计

默认规则：

- `scene=user_avatar`
- 头像大小限制为 `30KB`
- 头像类型仅允许 `image/jpeg`、`image/png`、`image/webp`
- 头像 OSS key：`avatars/{tenantId-or-os}/{uploadId}.{ext}`
- 使用 DB 保存轻量上传记录，不保存 `policy`、`signature`、`secret`
- 头像对象公开读，用户资料返回 `avatarUrl`

## 2. 核心流程

### 2.1 申请上传凭证

前端请求后端：

```http
POST /uploads/policies
Authorization: Bearer <access_token>
```

请求：

```ts
{
  scene: 'user_avatar';
  fileName: string;
  contentType: string;
  size: number;
}
```

后端根据 `scene` 读取规则，校验文件大小、MIME 类型和扩展名，然后生成：

- `uploadId`
- `objectKey`
- OSS POST policy
- OSS form-data 字段
- 上传记录 `upload_objects.status=issued`

响应：

```ts
{
  uploadId: string;
  scene: 'user_avatar';
  method: 'post';
  host: string;
  objectKey: string;
  publicUrl: string;
  formData: Record<string, string>;
  expiresAt: string;
}
```

### 2.2 前端直传 OSS

前端使用后端返回的 `host` 和 `formData` 组装 `FormData`，把文件直接提交到 OSS

上传文件流不经过业务后端

### 2.3 确认上传完成

前端直传 OSS 成功后请求：

```http
POST /uploads/{uploadId}/complete
Authorization: Bearer <access_token>
```

后端行为：

- 校验 `uploadId` 属于当前用户
- 校验记录未过期
- 校验记录状态为 `issued`
- 调用 OSS HEAD 确认对象存在
- 标记上传记录为 `uploaded`

该接口只确认上传中心状态，不修改任何业务资料

### 2.4 业务接口消费 uploadId

当前用户资料更新接口消费头像上传结果：

```http
PATCH /auth/me
Authorization: Bearer <access_token>
```

请求第一版只开放头像字段：

```ts
{
  avatarUploadId?: string | null;
}
```

后端行为：

- 校验 `avatarUploadId` 对应上传记录存在
- 校验 `scene=user_avatar`
- 校验 `status=uploaded`
- 校验 `userId=当前用户`
- 事务内更新 `users.avatarObjectKey`
- 事务内标记上传记录为 `used`
- 事务后尝试异步删除旧头像

## 3. API 与类型变更

### 3.1 UploadSceneEnum

新增 `UploadSceneEnum`

第一版只导出：

```ts
export const UploadSceneEnum = {
  USER_AVATAR: 'user_avatar',
} as const;
```

合同 PDF 等后续场景暂不开放，避免前端误用未实现能力

### 3.2 上传 contracts

新增上传相关 contracts：

```ts
export interface CreateUploadPolicyRequest {
  scene: UploadScene;
  fileName: string;
  contentType: string;
  size: number;
}

export interface UploadPolicyResponse {
  uploadId: string;
  scene: UploadScene;
  method: 'post';
  host: string;
  objectKey: string;
  publicUrl: string;
  formData: Record<string, string>;
  expiresAt: string;
}

export interface CompleteUploadResponse {
  uploadId: string;
  scene: UploadScene;
  objectKey: string;
  publicUrl: string;
  status: 'uploaded';
  uploadedAt: string;
}
```

### 3.3 Auth contracts

扩展 `AuthUserProfile` / `AuthMeResponse` / `LoginResponse.user`：

```ts
avatarUrl: string | null;
```

新增当前用户资料更新请求：

```ts
export interface UpdateMyProfileRequest {
  avatarUploadId?: string | null;
}
```

## 4. Prisma 建模

### 4.1 users

`users` 增加当前头像指针：

```prisma
avatarObjectKey String? @db.VarChar(255)
```

只保存 OSS object key，不保存临时签名 URL

### 4.2 upload_objects

新增轻量上传记录表：

```prisma
model UploadObject {
  id               String             @id @db.VarChar(40)
  scene            UploadSceneEnum
  tenantId         String?            @db.VarChar(10)
  userId           String             @db.Uuid
  objectKey        String             @unique @db.VarChar(255)
  publicUrl        String             @db.VarChar(500)
  originalFileName String             @db.VarChar(255)
  contentType      String             @db.VarChar(100)
  size             Int
  status           UploadObjectStatus @default(ISSUED)
  expiresAt        DateTime           @db.Timestamptz(3)
  uploadedAt       DateTime?          @db.Timestamptz(3)
  usedAt           DateTime?          @db.Timestamptz(3)
  createdAt        DateTime           @default(now()) @db.Timestamptz(3)
  updatedAt        DateTime           @updatedAt @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id])

  @@index([userId, scene, status, createdAt])
  @@index([status, expiresAt])
  @@index([tenantId, scene, status, createdAt])
  @@map("upload_objects")
}
```

状态枚举：

```prisma
enum UploadObjectStatus {
  ISSUED  @map("issued")
  UPLOADED @map("uploaded")
  USED    @map("used")
  EXPIRED @map("expired")
  DELETED @map("deleted")
}
```

场景枚举：

```prisma
enum UploadSceneEnum {
  USER_AVATAR @map("user_avatar")
}
```

## 5. 配置与 OSS 适配

新增上传配置：

- `OSS_BUCKET`
- `OSS_REGION`
- `OSS_ENDPOINT`
- `OSS_PUBLIC_BASE_URL`
- `OSS_POLICY_EXPIRES_SECONDS=600`
- `OSS_AVATAR_MAX_SIZE_BYTES=30720`

复用现有：

- `ALIYUN_ACCESS_KEY_ID`
- `ALIYUN_ACCESS_KEY_SECRET`

新增 `AliyunOssAdapter`，负责：

- 生成 POST policy
- 计算签名
- HEAD 对象
- DELETE 对象

实现优先使用 Node 内置能力，不强制引入 OSS SDK

## 6. 模块施工明细

### T01 契约与文档

- 更新 `docs/api`，说明通用上传三步流程：申请凭证、直传 OSS、确认完成、业务接口消费 `uploadId`
- 新增上传 contracts，并在 `packages/types/src/contracts/index.ts` 导出
- 新增 `UploadSceneEnum`
- 扩展 auth contracts 和 Swagger：`avatarUrl`、`PATCH /auth/me`

### T02 Prisma 建模

- `users` 增加 `avatarObjectKey`
- 新增 `upload_objects`
- 新增 Prisma 上传场景和状态枚举
- 同步 `docs/prisma/data-model-reference.md`

### T03 OSS 配置与适配器

- 新增 `upload.config.ts`
- `env.validation.ts` 校验 OSS 配置完整性
- 新增 `AliyunOssAdapter`
- 明确 OSS 公开访问 URL 使用 `OSS_PUBLIC_BASE_URL + '/' + objectKey`

### T04 UploadModule

- 新增 `UploadModule`
- 新增 `UploadController`
- 新增 `UploadService`
- `POST /uploads/policies` 负责签发直传凭证
- `POST /uploads/{uploadId}/complete` 负责确认 OSS 已收到对象

### T05 用户头像消费

- 新增 `PATCH /auth/me`
- `AuthService` 消费 `avatarUploadId`
- `GET /auth/me` 和登录响应返回 `avatarUrl`
- 旧头像删除失败不影响新头像生效

### T06 清理

- 增加清理逻辑：
  - `issued` / `uploaded` 且过期未使用的记录可删除 OSS 对象并标记 `expired` / `deleted`
  - 删除前检查对象未被业务引用
- 第一版可先实现 service 方法，后续再接定时任务

## 7. 多租户与权限边界

- 上传接口必须登录
- Tenant 用户生成路径：`avatars/{tenantId}/{uploadId}.{ext}`
- OS 用户生成路径：`avatars/os/{uploadId}.{ext}`
- 前端不得传 `objectKey`、`tenantId`、`scope`
- `tenantId` 和 `userId` 均以后端当前登录态为准
- 确认上传和业务消费都必须校验 `userId=当前用户`
- Tenant 侧不得依赖前端传入的租户信息

## 8. 清理与旧头像删除规则

用户更换头像时：

1. 事务内读取旧 `users.avatarObjectKey`
2. 更新为新上传对象的 `objectKey`
3. 标记上传记录为 `used`
4. 事务后处理旧头像删除

旧头像删除保护：

- 旧 key 为空不删除
- 旧 key 与新 key 相同不删除
- 旧 key 不属于 `avatars/` 前缀不删除
- 删除前确认旧 key 未被任何用户引用
- OSS 删除失败只记录日志，不回滚头像更新

## 9. 验证计划

构建：

```bash
pnpm -F api build
```

上传凭证场景：

- 未登录返回 401
- 非 `user_avatar` 返回 400
- 超过 30KB 返回 400
- 非图片 MIME 返回 400
- Tenant 用户生成 `avatars/{tenantId}/{uploadId}.{ext}`
- OS 用户生成 `avatars/os/{uploadId}.{ext}`

上传完成场景：

- 不存在 uploadId 失败
- 过期 uploadId 失败
- 非本人 uploadId 失败
- OSS 对象不存在失败
- 成功后状态变为 `uploaded`

用户资料场景：

- `avatarUploadId` 非本人失败
- `avatarUploadId` 非头像 scene 失败
- `avatarUploadId` 未完成上传失败
- 成功后 `users.avatarObjectKey` 更新
- `GET /auth/me` 返回 `avatarUrl`
- 旧头像删除失败不影响新头像生效

## 10. 当前默认假设

- 第一版只开放头像上传
- 合同 PDF 作为未来 scene，不进入本轮接口契约
- 上传中心不直接修改业务对象，只提供可被业务接口消费的 `uploadId`
- 头像大小限制为 `30KB`
- OSS 头像对象公开读
- 不保存 OSS 签名凭证内容，只保存上传记录和对象引用
- 当前已开通 OSS 权限的 `ALIYUN_ACCESS_KEY_ID` / `ALIYUN_ACCESS_KEY_SECRET` 可用于后端生成上传 policy
