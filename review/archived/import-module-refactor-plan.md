# Import 模块改造计划

> 日期：2026-05-08
> 文档状态：已完成，已归档
> 文档定位：`import` 模块改造章节的收尾记录与归档入口
> 适用范围：`apps/api/src/import`、`docs/api/tenant-api-doc.md`

## 1. 收尾结论

截至 2026-05-08，本计划对应的 `T01 ~ T05` 已全部完成。

当前实现结构已收口为：

1. `ImportTemplateController`
2. `ImportJobController`
3. `ImportTemplateService`
4. `ImportPreviewService`
5. `ImportSubmitService`
6. `ImportJobQueryService`
7. `ImportJobRunnerService`
8. `ImportTenantJobStateService`

`import.service.ts` 与旧 `import.controller.ts` 已移除。

## 2. 已完成结果

本轮实际完成内容：

1. 模板入口拆到 `ImportTemplateController`
2. 导入任务入口拆到 `ImportJobController`
3. 预检逻辑拆到 `ImportPreviewService`
4. 正式提交逻辑拆到 `ImportSubmitService`
5. 任务查询逻辑拆到 `ImportJobQueryService`
6. `docs/api/tenant-api-doc.md` 已补实现结构说明
7. 旧 `import.controller.ts` 与 `import.service.ts` 已删除

## 3. 验证结果

章节验证结果如下：

1. `pnpm -F api build` 通过
2. `pnpm -F api test:smoke` 通过
3. `pnpm lint` 通过
4. `pnpm format:check` 全量失败，但失败项不在本轮 `import` 改动范围内
5. `pnpm exec prettier --check apps/api/src/import/**/*.ts docs/api/tenant-api-doc.md` 通过

## 4. 归档说明

本文件已完成使命，转入归档目录保留结果，不再继续追加新待办。

后续如再次改造导入链路，应新开计划，不再回写本文件。
