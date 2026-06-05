# 官方导入打印模板包库需求与施工方案

> 日期：2026-06-04
> 文档状态：方案讨论稿
> 文档定位：`notes` 非事实源，用于后续拆分实施；正式接口语义以后续 `docs/api`、`packages/types`、Swagger 与 Prisma schema 为准
> 适用范围：Tenant 导入模板、Tenant 打印配置、Admin 模板沉淀、官方模板包库、可选 ERP 适配标签

## 一、背景

当前 Tenant 侧已经具备导入映射模板与打印配置能力：

- 导入映射模板在前端负责把 ERP系统导出的Excel订单表通过sheetjs解析的订单列表映射为预检需要的数据结构
- 打印配置按 `tenantId + importTemplateId` 保存，`config` 为前端维护的黑盒 JSON
- 租户可自行创建导入模板，也可为某个导入模板配置对应打印模板

实际使用中，租户从零配置一套可用且趁手的“导入映射模板 + 打印模板”成本较高。尤其经销商可能来自不同 ERP 系统，不同 ERP 导出的订单字段、列名和格式不同，导致租户需要反复试错。

因此需要建设一个轻量官方导入打印模板包库。平台可以把已有租户沉淀出的优秀导入模板和打印配置整理为官方模板包；租户可以浏览已发布模板包，并创建一套属于自己的导入模板和打印模板副本，再继续按现有编辑能力微调。

ERP 厂商在本需求中只是可选筛选标签，前期对用户无感，用于帮助租户判断模板包是否更接近自己的来源单据格式。即使模板包没有 ERP 标签，业务仍然完整成立。

## 二、核心结论

1. 本需求建设的是“官方导入打印模板包库”，不是单独的打印模板库
2. 官方模板包包含导入字段映射快照与打印配置快照
3. ERP 厂商只是可选适配标签，不是核心资源，也不是复制模板包的必要条件
4. 租户复制模板包时，服务端在事务中创建新的 `ImportTemplate` 与 `PrinterTemplate`
5. 复制后的导入模板和打印配置都归当前租户所有，可继续按现有逻辑编辑
6. 复制模板包不设置默认导入模板，不覆盖租户已有模板
7. 官方模板包不长期保存来源租户、来源导入模板或来源打印配置 ID
8. 打印配置 `config` 仍保持黑盒 JSON，服务端不解析模板内部布局结构

## 三、目标与非目标

### 3.1 目标

- 降低租户从导入到打印链路的初始配置复杂度
- 支持租户浏览官方推荐模板包
- 支持租户按可选 ERP 标签筛选模板包
- 支持租户基于官方模板包创建自己的导入模板和打印模板
- 支持租户复制后继续按现有导入模板和打印配置能力微调
- 支持 Admin 从优秀租户模板中创建官方模板包草稿
- 支持官方模板包发布和下线
- 保持多租户隔离，Tenant 侧不能查看其他租户原始打印配置
- 保持打印配置黑盒 JSON 边界，服务端不承担模板布局解析和渲染

### 3.2 非目标

- 不在首版实现服务端打印渲染引擎
- 不在首版解析打印配置内部节点结构
- 不让租户直接浏览所有租户的打印模板
- 不让官方模板包运行时依赖来源租户的导入模板或打印配置
- 不在复制模板包时覆盖租户已有导入模板或打印模板
- 不在复制模板包时自动设为默认导入模板
- 不把 ERP 厂商建设为首版核心资源或独立运营对象
- 不在首版实现租户投稿、模板市场、评分、收藏等能力
- 不在首版自动把官方模板包更新推送到已复制租户

## 四、业务流程

### 4.1 Admin 沉淀模板包

Admin 侧流程：

```text
Admin 查看租户已有导入模板与打印配置候选
  -> 选择配置较好的候选
  -> 创建官方模板包草稿
  -> 草稿复制候选的导入字段快照和打印配置快照
  -> Admin 设置名称、说明、可选 ERP 标签、预览图、标签
  -> Admin 人工脱敏和整理
  -> 发布为官方模板包
```

关键规则：

- Admin 只能在平台侧查看候选池
- Tenant 侧不能查看其他租户候选
- 候选晋升为官方模板包时必须复制快照
- 来源租户后续改动不影响官方模板包
- 发布前应由 Admin 人工确认脱敏结果
- 已发布模板包才允许 Tenant 复制
- 官方模板包主表不长期保存来源租户、来源导入模板或来源打印配置 ID

### 4.2 Tenant 使用模板包

Tenant 侧流程：

```text
租户进入官方模板包库
  -> 可按 ERP 标签筛选，也可查看全部模板包
  -> 查看模板包详情和预览
  -> 选择最接近的模板包创建副本
  -> 服务端创建新的导入模板和打印模板
  -> 租户继续按现有页面微调导入映射和打印配置
```

关键规则：

- ERP 标签用于筛选和适配提示，不限制租户复制其他模板包
- 没有 ERP 标签的模板包仍可展示和复制
- 复制动作不会修改官方模板包
- 复制动作不会修改任何其他租户数据
- 复制动作不会覆盖当前租户已有模板
- 复制后新建的资源属于当前租户
- 后续编辑完全走现有导入模板和打印配置逻辑

## 五、领域模型

### 5.1 导入模板新增 ERP 标签

现有 `ImportTemplate` 建议新增可选字段：

```text
erpVendor
```

语义：

- 表示该导入映射模板主要适配哪个 ERP 厂商导出的订单格式
- 用于租户管理自己的导入模板时辅助区分来源
- 用于官方模板包复制后继承适配标签
- 不表示租户只能使用某个 ERP
- 不参与订单归属、支付链路或导入任务状态机
- 可为空，空值不影响导入模板和打印模板正常使用

首版建议：

```text
数据库保存 erpVendor 字符串 code
服务端用集中常量维护当前可选 ERP code 和展示名
不新增 ERP 厂商表
不使用 Prisma enum
```

### 5.2 官方模板包

新增官方导入打印模板包模型，建议命名：

```text
printing_template_packages
```

核心字段建议：

```text
id
name
previewImageUrl
status
version
importTemplateSnapshot
printingConfigSnapshot
createdAt
updatedAt
publishedAt
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `erpVendor` | 可选 ERP 适配标签，可为空 |
| `importTemplateSnapshot` | 导入映射模板字段快照，包含系统字段和自定义字段 |
| `printingConfigSnapshot` | 打印配置黑盒 JSON 快照 |
| `status` | 草稿、已发布、已下线 |
| `version` | 官方模板包版本 |

状态建议：

```text
draft
published
offline
```

明确不保存以下来源字段：

```text
sourceTenantId
sourceTenantName
sourceImportTemplateId
sourceImportTemplateName
sourcePrinterTemplateId
sourcePrinterTemplateVersion
```

说明：

- 官方模板包是平台整理后的独立资产
- 来源追溯不进入模板包主模型
- 如后续需要轻量追踪，可通过操作日志解释创建来源
- 移除来源字段可以减少敏感信息暴露和模型复杂度

### 5.3 租户打印配置来源

首版可以不在 `PrinterTemplate` 增加复杂来源字段。

如果需要在租户打印配置列表展示“来自官方模板包”，可考虑最小增加：

```text
source
```

来源建议：

```text
custom
```

说明：

- 非必需字段，不阻塞主链路
- 通过官方模板包复制生成时可写入 `official_package`
- 租户后续手工保存打印配置后可改为 `custom`
- 不保存 `packageId / packageName / packageVersion` 等冗余字段
- 打印配置生效仍以当前租户 `printer_templates.config` 为准

## 六、接口设计

### 6.1 Tenant 获取官方模板包列表

```http
GET /settings/printing/template-packages
```

权限：

```text
settings.printing.read
```

查询参数建议：

```ts
interface PrintingTemplatePackageListQuery {
  erpVendor?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}
```

响应建议：

```ts
interface PrintingTemplatePackageListItem {
  id: string;
  name: string;
  description?: string;
  erpVendor?: string;
  erpVendorName?: string;
  previewImageUrl?: string;
  tags?: string[];
  version: number;
  updatedAt: string;
}
```

业务规则：

- 只返回 `published` 模板包
- 不返回来源租户信息
- 不返回完整 `printingConfigSnapshot`
- `erpVendor` 是可选筛选和展示字段，不是强业务依赖
- 不传 `erpVendor` 时返回全部已发布模板包

### 6.2 Tenant 获取官方模板包详情

```http
GET /settings/printing/template-packages/{packageId}
```

权限：

```text
settings.printing.read
```

响应建议：

```ts
interface PrintingTemplatePackageDetail {
  id: string;
  name: string;
  description?: string;
  erpVendor?: string;
  erpVendorName?: string;
  previewImageUrl?: string;
  tags?: string[];
  version: number;
  importTemplateSnapshot: {
    defaultFields: OrderImportTemplateField[];
    customerFields: OrderImportTemplateField[];
  };
  printingConfigSnapshot: Record<string, unknown>;
  updatedAt: string;
}
```

业务规则：

- 只允许查询 `published` 模板包
- Tenant 侧不返回来源租户信息
- `printingConfigSnapshot` 返回给前端用于预览
- 前端负责解析打印配置并渲染预览
- 服务端不解析打印配置内部布局结构

### 6.3 Tenant 创建模板包副本

最终确定接口：

```http
POST /settings/printing/template-packages/{packageId}/copies
```

权限：

```text
templates.manage
settings.printing.update
```

请求建议：

```ts
interface CreatePrintingTemplatePackageCopyRequest {
  importTemplateName?: string;
  remark?: string;
}
```

说明：

- `importTemplateName` 表示复制后在当前租户下新建的导入模板名称
- 不传 `importTemplateName` 时，服务端可用官方模板包名称生成当前租户内唯一名称
- `remark` 写入新建打印配置备注
- 不包含 `isDefaultImportTemplate`
- 不包含 `erpVendor`，复制时从官方模板包继承可选 ERP 标签

响应建议：

```ts
interface CreatePrintingTemplatePackageCopyResponse {
  importTemplateId: string;
  importTemplateName: string;
}
```

服务端动作：

```text
读取官方模板包
  -> 校验 status=published
  -> 校验当前用户为 Tenant 用户
  -> 校验权限
  -> 创建当前租户 ImportTemplate
  -> 创建当前租户 PrinterTemplate
  -> 写审计日志
  -> 返回新建导入模板最小信息
```

事务要求：

- 创建 `ImportTemplate` 和 `PrinterTemplate` 必须放在同一事务
- 任一失败则整体回滚
- 不产生只有导入模板没有打印模板的半成品

名称冲突规则建议：

- 若请求传入 `importTemplateName` 且当前租户已存在同名模板，返回 `409`
- 若请求未传入 `importTemplateName`，服务端按官方模板包名称自动生成唯一名称

### 6.4 Admin 候选池列表

```http
GET /platform/printing-template-candidates
```

权限：

```text
Admin 平台用户，tenantId=null
```

响应摘要建议：

```ts
interface PrintingTemplateCandidateItem {
  printerTemplateId: string;
  tenantName: string;
  importTemplateName: string;
  erpVendor?: string;
  erpVendorName?: string;
  updatedAt: string;
}
```

业务规则：

- Admin 可跨租户查看候选摘要
- 候选来源是已有 `printer_templates` 及其关联 `import_templates`
- 这是平台运营能力，不开放给 Tenant
- 列表只返回筛选和选择所需摘要，避免暴露过多租户细节

### 6.5 Admin 候选详情

```http
GET /platform/printing-template-candidates/{printerTemplateId}
```

响应建议：

```ts
interface PrintingTemplateCandidateDetail {
  printerTemplateId: string;
  tenantName: string;
  importTemplateName: string;
  erpVendor?: string;
  erpVendorName?: string;
  defaultFields: OrderImportTemplateField[];
  customerFields: OrderImportTemplateField[];
  config: Record<string, unknown>;
}
```

业务规则：

- 只供 Admin 用于预览和筛选优秀模板
- 详情保留必要上下文和创建草稿所需快照
- 不返回 `configVersion / updatedBy / remark` 等非必要字段
- 需要提示 Admin 注意脱敏
- 服务端仍不解析 `config`

### 6.6 Admin 从候选创建官方模板包草稿

```http
POST /platform/printing-template-candidates/{printerTemplateId}/template-package-drafts
```

请求建议：

```ts
interface CreatePrintingTemplatePackageDraftFromCandidateRequest {
  name: string;
  description?: string;
  erpVendor?: string;
  previewImageUrl?: string;
  tags?: string[];
}
```

业务规则：

- 复制候选关联的 `ImportTemplate.defaultFields`
- 复制候选关联的 `ImportTemplate.customerFields`
- 复制候选 `PrinterTemplate.config`
- 不保存来源租户或来源模板 ID
- 初始状态为 `draft`
- `erpVendor` 可从来源导入模板继承，也可由 Admin 发布前修正

### 6.7 Admin 官方模板包管理

建议接口：

```http
GET /platform/printing-template-packages
GET /platform/printing-template-packages/{packageId}
PUT /platform/printing-template-packages/{packageId}
POST /platform/printing-template-packages/{packageId}/publish
POST /platform/printing-template-packages/{packageId}/offline
```

业务规则：

- 只允许平台用户操作
- `publish` 后 Tenant 才可见
- `offline` 后 Tenant 不可继续复制，但已复制出的租户模板不受影响
- Admin 编辑已发布模板包时建议递增 `version`
- 已复制给租户的模板不随官方模板包变化自动更新

## 七、多租户与权限边界

Tenant 侧：

- 只能查看已发布官方模板包
- 不能查看其他租户候选模板
- 不能查看其他租户原始打印配置
- 创建副本时 `tenantId` 从 token 注入
- 新建导入模板和打印模板都归当前租户
- 不允许前端传 `tenantId` 决定归属

Admin 侧：

- Admin 用户 `tenantId = null`
- Admin 可跨租户查看候选池
- Admin 可创建、编辑、发布和下线官方模板包
- Admin 侧候选池属于平台运营能力，不代表 Tenant 可跨租户访问

## 八、数据一致性规则

- 官方模板包创建时复制快照，不引用来源租户运行时数据
- 来源租户修改导入模板或打印配置，不影响官方模板包
- 来源租户删除导入模板或打印配置，不影响官方模板包
- Tenant 复制官方模板包后，不影响官方模板包
- Tenant 复制官方模板包后，不影响任何其他租户
- Tenant 后续编辑导入模板或打印模板，不影响官方模板包
- 官方模板包下线，不影响已复制出的租户模板
- ERP 标签为空不影响模板包复制和租户后续使用

## 九、前端交互建议

Tenant 模板库页面：

```text
查看官方模板包库
  -> 可选按 ERP 标签筛选
  -> 查看模板包详情和预览
  -> 创建副本
  -> 跳转导入模板编辑或打印模板编辑
```

Admin 候选池页面：

```text
查看租户优秀模板候选
  -> 预览候选打印效果
  -> 创建官方模板包草稿
  -> 设置名称、说明、可选 ERP 标签、预览图
  -> 人工脱敏和整理
  -> 发布
```

## 十、实施方案计划

### T01 契约与语义落档

目标：

- 在 `docs/api` 明确官方导入打印模板包的业务语义
- 明确 ERP 厂商只是可选适配标签
- 明确 Tenant 复制行为创建新导入模板和新打印模板
- 明确 Tenant 不可查看其他租户候选

涉及文件：

```text
docs/api/tenant-api-doc.md
docs/api/tenant-settings.md
docs/api/admin-api-doc.md
packages/types/src/contracts
```

完成标准：

- Tenant 设置文档新增模板包库入口
- Admin 文档新增候选池和模板包管理语义
- contracts 定义请求响应结构
- API 文档不把模板包写成第二份 Swagger 机械字段表

### T02 Prisma 建模

目标：

- 为导入模板增加可选 ERP 标签字段
- 新增官方模板包模型
- 必要时为租户打印配置增加最小来源字段

涉及文件：

```text
apps/api/prisma/schema.prisma
docs/prisma/data-model-reference.md
```

建议模型变化：

```text
ImportTemplate.erpVendor
PrintingTemplatePackage
PrinterTemplate.source 可选
```

完成标准：

- 多租户字段边界明确
- 官方模板包不保存来源租户或来源模板 ID
- 黑盒 JSON 字段继续用 Json
- 索引能支撑按 `status + erpVendor` 查询模板包
- 建模参考文档同步

### T03 Tenant 模板包查询与复制

目标：

- Tenant 可查询已发布模板包
- Tenant 可复制模板包生成自己的导入模板和打印模板

涉及模块：

```text
apps/api/src/settings
apps/api/src/import
```

建议接口：

```http
GET /settings/printing/template-packages
GET /settings/printing/template-packages/{packageId}
POST /settings/printing/template-packages/{packageId}/copies
```

完成标准：

- 列表只返回 `published`
- 详情可返回打印配置快照供前端预览
- 创建副本使用事务
- 创建副本不设置默认模板
- 创建副本不覆盖已有模板
- 创建副本后资源归当前租户
- 响应只返回新建导入模板最小信息
- 无权限或跨租户访问被阻断

### T04 Admin 候选池与模板包草稿

目标：

- Admin 可查看租户已有打印配置候选
- Admin 可从候选创建官方模板包草稿

涉及模块：

```text
apps/api/src/platform
apps/api/src/settings
```

建议接口：

```http
GET /platform/printing-template-candidates
GET /platform/printing-template-candidates/{printerTemplateId}
POST /platform/printing-template-candidates/{printerTemplateId}/template-package-drafts
```

完成标准：

- 仅平台用户可访问
- 候选详情包含必要上下文、导入字段快照和打印配置
- 创建草稿时复制快照
- 草稿不保存来源租户或来源模板 ID
- Tenant 不可访问候选池

### T05 Admin 模板包管理

目标：

- Admin 可维护官方模板包生命周期

建议接口：

```http
GET /platform/printing-template-packages
GET /platform/printing-template-packages/{packageId}
PUT /platform/printing-template-packages/{packageId}
POST /platform/printing-template-packages/{packageId}/publish
POST /platform/printing-template-packages/{packageId}/offline
```

完成标准：

- 草稿可编辑
- 发布后 Tenant 可见
- 下线后 Tenant 不可新复制
- 已复制租户模板不受下线影响
- 编辑发布态模板包时版本递增或有明确版本策略

### T06 前端联调与体验收口

目标：

- Tenant 可浏览模板包
- Tenant 可按 ERP 标签筛选模板包
- Tenant 可预览并创建副本
- Admin 可沉淀和发布模板包

联调场景：

- 有 ERP 标签时按标签筛选模板包
- 无 ERP 标签时模板包仍可展示和复制
- 创建副本后跳转编辑导入模板
- 创建副本后跳转编辑打印配置
- Admin 从候选创建草稿并发布
- 已下线模板包不再出现在 Tenant 列表

### T07 验证与质量门禁

建议验证命令：

```bash
pnpm -F api build
pnpm -F api test:smoke
pnpm -F api test:backend-regression
```

必要场景：

- Tenant 不能看到其他租户候选模板
- Tenant 复制模板包时不能指定其他 tenantId
- Tenant 复制模板包后创建 `ImportTemplate`
- Tenant 复制模板包后创建 `PrinterTemplate`
- 复制过程中任一失败时事务回滚
- Admin 下线模板包后 Tenant 不能继续复制
- 来源租户修改或删除原模板不影响官方模板包
- 官方模板包更新不影响已复制出的租户模板
- 打印配置黑盒 JSON 不被服务端解析和改写

## 十一、风险与决策点

### 11.1 ERP 标签形态

当前结论：

- 首版不新增 ERP 厂商表
- 首版不使用 Prisma enum
- 数据库保存可选字符串 code
- 服务端集中常量维护当前可选 ERP code 和展示名
- ERP 标签缺失不影响模板包复制和后续使用

后续满足以下条件时再考虑升级 ERP 字典表：

- Admin 需要后台新增、编辑、禁用 ERP
- ERP 需要 Logo、别名、关键词、排序、行业分类
- ERP 数量明显变多，且经常变更
- 需要按 ERP 做复杂推荐、统计或运营配置

### 11.2 自定义字段 key 保留

风险：

- 官方模板包可能包含候选租户的自定义字段
- 打印配置可能引用这些自定义字段 key
- 复制时如果重新生成 key，打印配置可能失效

建议：

- 官方模板包复制到租户时保留快照里的自定义字段 key
- 该保留逻辑仅用于官方模板包复制，不开放给普通租户创建接口任意指定 key
- 后续租户编辑时继续走现有更新逻辑保持 key 稳定

### 11.3 打印配置脱敏

风险：

- 候选租户打印配置可能包含商户名称、Logo、地址、电话等敏感信息
- 服务端不解析打印配置 JSON，无法可靠自动脱敏

建议：

- Admin 发布前必须人工预览和整理
- 首版不承诺服务端自动脱敏
- 前端 Admin 编辑器负责解析和修改打印配置

### 11.4 默认模板策略

结论：

- 复制官方模板包时不设置默认导入模板
- 不提供 `isDefaultImportTemplate`
- 租户如需设默认，应通过现有导入模板管理能力单独操作

## 十二、当前推荐决策

当前推荐按以下口径实施：

1. 将需求命名为“官方导入打印模板包库”
2. ERP 厂商仅作为可选适配标签，不作为核心资源
3. 租户复制模板包使用 `POST /settings/printing/template-packages/{packageId}/copies`
4. 请求体只保留 `importTemplateName` 和 `remark`
5. 响应体只返回 `importTemplateId` 和 `importTemplateName`
6. 复制时创建新的租户 `ImportTemplate` 和 `PrinterTemplate`
7. 不设置默认导入模板，不覆盖已有模板
8. Admin 从候选池创建草稿，人工整理后发布
9. 官方模板包不保存来源租户或来源模板 ID
10. 打印配置继续保持黑盒 JSON，服务端不解析布局结构
11. 正式实现前先同步 `docs/api`、`contracts`、Prisma schema 和建模参考
