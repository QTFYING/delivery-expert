# Tenant 导入流程

> 本文件承接 Tenant 导入核心功能的业务语义，包括默认模板、租户模板、预检、正式导入、导入任务与快照一致性
> 若本文件的领域细节与 [tenant-api-doc.md](./tenant-api-doc.md) 的全局边界冲突，以全局边界为准

## 一、定位

Tenant 订单导入链路为：

`默认模板 -> 租户模板 -> 预检 -> 预检快照 -> 正式导入 -> 导入任务 -> 订单查询`

本文件保留导入链路中容易膨胀的业务细节，包括预检校验、字段标准化、快照一致性和正式导入消费约束。

请求/响应结构、`nullable`、示例和分页包装以 Swagger 与 `packages/types/src/contracts` 为准。

## 二、接口索引与契约

### 2.1 获取系统默认映射模板

- **GET** `/import/default-template`
- **权限**：`templates.manage`

**契约类型：** 响应：`OrderImportTemplateField[]`

**字段语义：**

- `isRequired`：为 `true` 的字段，在创建/更新模板时 `mapStr` 必须填写；为 `false` 时 `mapStr` 允许为空字符串
- `isValueRequired`：服务端 `/preview` 校验开关。前端请求时可省略；服务端以本接口返回的系统定义为权威值，自动覆盖前端入参
- `mapStr` 在同一模板内允许重复，不做去重校验
- 固定返回 14 项系统字段，其中 7 项订单头字段与 7 项订单明细字段的 `key / type` 为稳定值；订单明细字段新增 `packSpec`，表示销售单位内含规格，例如 `24桶`

### 2.2 导入-获取模板列表

- **GET** `/import/templates`
- **权限**：`templates.read`

**契约类型：** 响应：`OrderImportTemplate[]`

**业务规则：**

- `defaultFields` 固定 14 项，字段 key 与 `GET /import/default-template` 保持一致
- 其中 3 项订单头字段（`sourceOrderNo / customer / orderTime`）`isRequired=true`，模板创建/更新时 `mapStr` 必填
- 其余 4 项订单头字段（`customerPhone / customerAddress / totalAmount / payType`）`isRequired=false`，`mapStr` 允许为空
- 除 `customerPhone` 外的 6 项订单头字段均为 `isValueRequired=true`，服务端 `/preview` 会强制这些列有值；`customerPhone.isValueRequired=false`，缺失或空字符串会在正式导入时存为 `NULL`
- 7 项订单明细字段均为 `isRequired=false`、`isValueRequired=false`，mapStr 与导入值都允许为空；其中 `packSpec` 表示销售单位内含规格，可与 `skuSpec / unit` 组合展示为 `1箱 = 153g * 24桶`
- `isRequired` 控制模板 `mapStr` 必填；`isValueRequired` 控制 `/preview` 值必填，服务端以系统定义为权威
- `customerFields` 为租户自定义字段，结构与默认字段一致
- 当前模板列表只返回新结构，不再返回旧三段式 `sourceColumns / fields / mappings`
- 该列表返回完整映射模板结构，同时服务订单列表自定义字段展示、按 `templateId` 筛选和导入前模板选择，因此读取权限独立为 `templates.read`

### 2.3 导入-创建模板

- **POST** `/import/templates`
- **权限**：`templates.manage`

**契约类型：** 请求：`CreateOrderImportTemplateRequest`；响应：`OrderImportTemplateMutationResponse`

**服务端规则：**

- `defaultFields` 必须完整包含 14 个系统字段，且 `key / label / isRequired / type` 不能改写
- `isValueRequired` 为服务端权威字段：前端可省略，即使传入错值也会被服务端静默覆盖为系统定义值
- `defaultFields[].mapStr` 仅在对应字段 `isRequired=true` 时必填；其余字段允许为空
- `defaultFields + customerFields` 内 `mapStr` 允许重复，不做全局去重
- 创建模板时，租户自定义字段 key 由服务端生成并随响应返回
- `customerFields[].mapStr` 允许为空字符串
- 所有 `customerFields[].isRequired` 均由服务端固定为 `false`
- `customerFields[].isValueRequired` 未传时默认为 `false`；设为 `true` 时 `/preview` 会强制该列必须有值
- `customerFields[].type` 未传时默认为 `list`
- 同租户下模板名称唯一；服务端按去首尾空格后比较，大小写不敏感
- `customerFields[].label` 在同一模板内不允许重复

**错误语义：**

- `400`：请求结构不合法，例如缺失系统字段、必填系统字段 `mapStr` 为空、固定字段被篡改、自定义字段 `label` 重复
- `409`：同租户下模板名称冲突

### 2.4 导入-更新模板

- **PUT** `/import/templates/{id}`
- **权限**：`templates.manage`

**契约类型：** 请求：`UpdateOrderImportTemplateRequest`；响应：`OrderImportTemplateMutationResponse`

**服务端规则：**

- 更新时仍按整包模板校验，不支持局部跳过系统字段
- `defaultFields` 必须完整包含 14 个系统字段，且 `key / label / isRequired / type` 不能改写
- `isValueRequired` 前端可省略；服务端以系统定义为权威值，传入值会被静默覆盖
- `defaultFields[].mapStr` 仅在 `isRequired=true` 时必填，其余允许为空；`mapStr` 在模板内允许重复
- 同租户下模板名称唯一；更新时排除当前模板自身
- 更新已有租户自定义字段时应保持原 key，新增字段由服务端分配新 key，未提交的旧字段视为删除
- `customerFields[].label` 在同一模板内不允许重复

**错误语义：**

- `400`：请求结构不合法，例如缺失系统字段、必填系统字段 `mapStr` 为空、固定字段被篡改、自定义字段 `label` 重复
- `404`：模板不存在，或模板不属于当前租户
- `409`：同租户下模板名称冲突

- 更新模板时按当前提交内容整体替换模板结构
- 租户自定义字段 key 用于关联历史订单自定义字段值，不应因排序调整重新编号
- 相同租户下若本次更新设置 `isDefault=true`，则其他模板自动取消默认

### 2.5 导入-数据预检校验

- **POST** `/import/preview`
- **权限**：`orders.import.manage`

**契约类型：** 请求：`OrderImportPreviewRequest`；响应：`OrderImportPreviewResponse`

**关键规则：**

- `/import/preview` 同步执行订单级预检，不进入 `import-worker`
- `/import/preview` 入参中的 `payType` 必须有值；若源文件未映射结算方式或映射值为空，前端必须在提交前按用户确认的默认选择补入 `cash`
- 服务端不把空 `payType` 自行判定为现款；空值仍按 `isValueRequired=true` 校验失败
- 导入结算方式由服务端标准化为 `payType + creditType`：现款/现金/`cash` 为 `cash + null`，月结为 `credit + month`，周结为 `credit + week`，账期/赊账/`credit` 为 `credit + period`，滚结为 `cash + null`
- 预检响应中的有效订单返回标准化后的 `payType / creditType / creditDays / dueDate`
- 正式导入必须消费同一份预检快照，不能重新按另一套规则识别

### 2.6 异步正式导入

- **POST** `/orders/import`
- **权限**：`orders.import.manage`

**契约类型：** 请求：`OrderImportSubmitRequest`；响应：`OrderImportSubmitResponse`

**业务规则：**

- `/orders/import` 只能消费 `previewId`，不再支持直传 `orders / rows / templateId`
- 正式导入消费预检快照中的标准化账期字段：`payType / creditType / creditDays / dueDate`，写入时内部到期日字段对应 `creditDueDate`
- 一个 `previewId` 成功创建导入任务后立即视为已消费，不允许重复提交
- 正式导入才进入 `import-worker`；预检始终同步执行

### 2.7 轮询导入进度

- **GET** `/orders/import/jobs/{jobId}`
- **权限**：`orders.import.manage`

**契约类型：** 响应：`OrderImportJobResponse`

## 三、模板字段规则

系统默认映射模板固定返回 14 项系统字段，其中 7 项订单头字段与 7 项订单明细字段的 `key / type` 为稳定值；订单明细字段包含 `packSpec`，用于表达销售单位内含规格，例如 `24桶`。

`isRequired` 只控制模板 `mapStr` 是否必填。`isValueRequired` 是服务端 `/import/preview` 校验开关，前端请求时可省略；服务端以系统定义为权威值。

默认订单头字段中，除 `customerPhone` 外的 `sourceOrderNo / customer / customerAddress / totalAmount / orderTime / payType` 均要求有值。`payType` 的默认模板 `mapStr` 可以为空，但提交 `/import/preview` 的标准订单里 `payType` 必须由前端按用户选择补齐。

`customerPhone` 为可选字段；前端不传、传 `null` 或传空字符串时，服务端不作为预检错误，正式导入落库为 `NULL`。

`orders[].customerFieldValues` 只承载导入模板 `type=list` 的订单级自定义字段值；`orders[].lineItems[].customerFieldValues` 只承载 `type=line` 的商品行级自定义字段值。key 必须命中当前模板的 `customerFields[].key`，且字段类型必须匹配。

若 `customerFields[].isValueRequired=true`，`type=list` 字段要求每张订单有值，`type=line` 字段要求每条商品明细有值；预检错误文案应优先使用模板字段 `label`。

## 四、预检校验规则

`POST /import/preview` 同步执行订单级预检，不进入 `import-worker`。

预检规模限制：

- 请求体最大 `20 MB`
- `orders` 最多允许 `5000` 条
- 全部订单的 `lineItems` 总数最多允许 `50000` 条
- `orders` 必须为非空数组

订单字段规则：

- `sourceOrderNo` 永远必填，作为订单唯一标识，不受模板配置影响
- `orderTime` 支持 `YYYY-MM-DD` 或 `YYYY-MM-DD HH:mm:ss`；仅传日期时按当天 `00:00:00` 归一化
- `totalAmount` 允许为 `0`，不允许为负数；`0` 元订单正式导入后视为无需收款，订单状态直接写为 `paid`，`paid=0`
- `lineItems` 至少需要 1 条
- 明细字段 `skuName / skuSpec / unit / quantity / packSpec / unitPrice / lineAmount` 默认均为可选
- `quantity * unitPrice = lineAmount` 仅在三者同时提供时校验

`invalidOrders.length === 0` 时，前端才应继续触发正式导入。

同一用户若已有预检请求正在执行，服务端应提示“预检进行中”，避免重复提交同一批数据。

租户内即使已有 `pending / processing` 的正式导入任务，仍允许继续调用 `/import/preview` 生成新的预检结果；是否能正式提交由 `/orders/import` 在提交时单独判断。

## 五、结算方式标准化

导入预检中，`payType` 入参为原始结算方式文本，支持 `cash`、`credit`、现款、现金、月结、周结、账期、赊账、滚结等业务值。空值不是有效入参；若源文件为空，前端应在提交前按用户选择补入 `cash` 或其他明确结算方式。

标准化规则：

| 原始值                 | 标准化 payType | 标准化 creditType | creditDays |
| ---------------------- | -------------- | ----------------- | ---------- |
| 现款 / 现金 / `cash`   | `cash`         | `null`            | `null`     |
| 滚结                   | `cash`         | `null`            | `null`     |
| 月结                   | `credit`       | `month`           | `30`       |
| 周结                   | `credit`       | `week`            | `7`        |
| 账期 / 赊账 / `credit` | `credit`       | `period`          | `30`       |

滚结本期按现款处理，不进入账期体系，不出现在 `/orders/credit`，不参与账期待办和 `payType=credit` 统计。

普通账期 `period` 的默认天数本期先使用服务端常量 `30`。后续如需可配置，应先回到 `tenant-api-doc.md` 变更语义，不直接新增独立规则接口。

`dueDate` 表示应收款到期日，对外字段名使用 `dueDate`，内部持久化字段继续使用 `creditDueDate`。

预检响应中的有效订单返回标准化后的 `payType / creditType / creditDays / dueDate`。正式导入必须消费同一份预检快照，不能重新按另一套规则识别。

## 六、预检快照与正式导入

服务端将预检结果缓存到 Redis，默认保留 15 分钟；超时未发起正式导入时，前端需要重新调用 `/import/preview`。

预检快照需绑定生成时的租户导入版本 `importRevision`。

`POST /orders/import` 只能消费 `previewId`，不再支持直传 `orders / rows / templateId`。

一个 `previewId` 成功创建导入任务后立即视为已消费，不允许重复提交。

正式导入才进入 `import-worker`；预检始终同步执行。

同一租户若已有 `pending / processing` 导入任务，服务端应拒绝再次发起，并返回当前任务状态与 `jobId`。该限制仅作用于正式导入提交；租户内已有活动导入任务时，前端仍可继续发起新的 `/import/preview`。

Redis 中的预检快照在 `/orders/import` 成功创建 `jobId` 后立即删除；任务恢复与轮询以 `import_jobs.snapshot` 为准。

`/orders/import` 成功创建 `jobId` 后，服务端应原子推进当前租户 `importRevision += 1`。

若当前 `previewId` 绑定的 `importRevision` 已落后于租户最新值，则该预检结果整体失效，服务端应拒绝本次提交并要求重新预检。
