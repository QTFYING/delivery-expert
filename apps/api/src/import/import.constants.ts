export const IMPORT_RUNTIME_MODE = 'IMPORT_RUNTIME_MODE';

export type ImportRuntimeMode = 'api' | 'worker';

/** 预检单次允许的订单数量上限；DTO 与 service 共用同一数值，文档 `tenant-api-doc.md` 亦同步 */
export const IMPORT_PREVIEW_MAX_ORDERS = 5000;

/** 预检单次全部订单的明细行累计上限（跨订单求和）；DTO 无法跨数组校验，由 service 兜底 */
export const IMPORT_PREVIEW_MAX_LINE_ITEMS = 50000;

/** 导入预检请求体大小上限；与 MAX_ORDERS 为配套业务契约（5000 条订单 × 若干明细） */
export const IMPORT_PREVIEW_BODY_LIMIT = '20mb';

/** 打印模板配置请求体上限；黑盒 JSON 可能含复杂坐标与 base64 片段 */
export const PRINTING_CONFIG_BODY_LIMIT = '1mb';
