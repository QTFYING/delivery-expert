/** 统一 API 响应结构 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

/** 通用批量操作结果 */
export interface BatchOperationResult {
  successCount: number;
  failedIds: string[];
}
