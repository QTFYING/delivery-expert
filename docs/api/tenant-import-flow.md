# Tenant 导入流程

> 本文件只补充导入链路中的模板规则、预检规则、结算方式标准化和快照一致性
> 请求/响应结构、分页、`nullable` 与示例以 Swagger 和共享 `contracts` 为准

## 一、导入链路

Tenant 订单导入链路为：

```text
默认模板 -> 租户模板 -> 预检 -> 预检快照 -> 正式导入 -> 导入任务 -> 订单查询
```

预检同步返回校验结果，不创建正式导入任务；正式导入异步执行，只能消费服务端签发的 `previewId`。

## 二、接口

### 2.1 获取系统默认映射模板

- **GET** `/import/default-template`

### 2.2 获取租户模板列表

- **GET** `/import/templates`

### 2.3 创建租户模板

- **POST** `/import/templates`

**业务规则：**

- 新建模板必须包含完整系统字段
- 租户自定义字段 key 由服务端生成并持久化
- 自定义字段 label 可重复，但不能为空

### 2.4 更新租户模板

- **PUT** `/import/templates/{id}`

**业务规则：**

- 更新模板时按当前提交内容整体替换模板结构
- 已有租户自定义字段应保持原 key；新增字段由服务端分配新 key；未提交的旧字段视为删除
- 租户自定义字段 key 用于关联历史订单自定义字段值，不应因排序调整重新编号

### 2.5 数据预检

- **POST** `/import/preview`

**关键规则：**

- `payType` 必须有值；源文件未映射或映射值为空时，前端必须按用户确认的默认选择补入
- 空 `payType` 不会被自动视为现款
- 预检响应中的有效订单会返回标准化后的 `payType / creditType / creditDays / dueDate`
- 正式导入必须消费同一份预检快照，不能重新按另一套规则识别

### 2.6 异步正式导入

- **POST** `/orders/import`

**业务规则：**

- 只能消费 `previewId`，不再支持直传 `orders / rows / templateId`
- 一个 `previewId` 成功创建导入任务后立即视为已消费，不允许重复提交
- 同一租户若已有 `pending / processing` 导入任务，再次提交正式导入会被拒绝

### 2.7 轮询导入进度

- **GET** `/orders/import/jobs/{jobId}`

## 三、模板字段规则

- `isRequired` 只控制模板 `mapStr` 是否必填
- `isValueRequired` 是 `/import/preview` 的字段值必填规则
- 二者都是服务端内置规则，不允许前端在创建或更新模板请求中配置
- `orders[].customerFieldValues` 只承载订单级自定义字段值
- `orders[].lineItems[].customerFieldValues` 只承载商品行级自定义字段值

## 四、预检校验规则

- `sourceOrderNo` 永远必填，作为订单唯一标识，不受模板配置影响
- `totalAmount` 允许为 `0`，不允许为负数；`0` 元订单正式导入后视为无需收款
- `quantity * unitPrice = lineAmount` 仅在三者同时提供时校验
- `invalidOrders.length === 0` 时，前端才应继续触发正式导入
- 租户内已有活动导入任务时，仍允许继续调用 `/import/preview` 生成新的预检结果

## 五、结算方式标准化

| 原始值                 | 标准化 payType | 标准化 creditType | creditDays |
| ---------------------- | -------------- | ----------------- | ---------- |
| 现款 / 现金 / `cash`   | `cash`         | `null`            | `null`     |
| 滚结                   | `cash`         | `null`            | `null`     |
| 月结                   | `credit`       | `month`           | `30`       |
| 周结                   | `credit`       | `week`            | `7`        |
| 账期 / 赊账 / `credit` | `credit`       | `period`          | `30`       |


普通账期 `period` 当前默认 `30` 天。后续如需支持租户可配置，应先回到 `tenant-api-doc.md` 变更语义。

## 六、预检快照与正式导入

- 预检结果默认有效 15 分钟
- 预检结果绑定生成时的租户导入版本；模板或数据版本变化后需要重新预检
- `/orders/import` 成功创建 `jobId` 后，当前 `previewId` 即视为已消费
- `/orders/import` 成功创建 `jobId` 后，当前租户导入版本会推进，旧预检结果不再可用于正式导入
