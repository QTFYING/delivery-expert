/** 通用列表查询参数 */
export interface ListParams {
  /** 页码 */
  page?: number;
  /** 每页条数 */
  pageSize?: number;
  /** 关键词 */
  keyword?: string;
}

/** 通用分页响应 */
export interface PaginatedResponse<T> {
  /** 列表数据 */
  list: T[];
  /** 总数 */
  total: number;
  /** 当前页码 */
  page: number;
  /** 当前每页条数 */
  pageSize: number;
}
