import type { ListParams, PaginatedResponse } from '../common';
import type { OrderImportTemplateField } from './order';
import type { PrintingTemplatePackageStatus } from '../enums';

/**
 * 官方打印模板包导入字段结构快照
 */
export interface PrintingTemplatePackageFieldSchema {
  /** 系统默认字段快照 */
  defaultFields: OrderImportTemplateField[];
  /** 租户自定义字段快照 */
  customerFields: OrderImportTemplateField[];
}

/**
 * Tenant 侧官方模板包列表查询
 */
export interface PrintingTemplatePackageListQuery extends ListParams {
  /** 可选 ERP 适配标签筛选 */
  erpVendor?: string;
}

/**
 * Tenant 侧官方模板包列表项摘要
 */
export interface PrintingTemplatePackageListItem {
  /** 模板包 ID */
  id: string;
  /** 模板包名称 */
  name: string;
  /** 模板包说明 */
  description?: string;
  /** 可选 ERP 适配标签 code */
  erpVendor?: string;
  /** ERP 适配标签展示名 */
  erpVendorName?: string;
  /** 预览图公开访问 URL */
  previewImageUrl?: string | null;
  /** 标签 */
  tags?: string[];
  /** 模板包版本 */
  version: number;
  /** 最近更新时间 */
  updatedAt: string;
}

/**
 * Tenant 侧官方模板包详情
 */
export interface PrintingTemplatePackageDetail {
  /** 模板包 ID */
  id: string;
  /** 模板包名称 */
  name: string;
  /** 模板包说明 */
  description?: string;
  /** 可选 ERP 适配标签 code */
  erpVendor?: string;
  /** ERP 适配标签展示名 */
  erpVendorName?: string;
  /** 预览图公开访问 URL */
  previewImageUrl?: string | null;
  /** 标签 */
  tags?: string[];
  /** 模板包版本 */
  version: number;
  /** 导入字段结构快照 */
  importTemplateSnapshot: PrintingTemplatePackageFieldSchema;
  /** 打印配置黑盒 JSON 快照 */
  printingConfigSnapshot: Record<string, unknown>;
  /** 最近更新时间 */
  updatedAt: string;
}

/**
 * Tenant 复制官方模板包请求
 */
export interface CreatePrintingTemplatePackageCopyRequest {
  /** 复制后在当前租户下新建的导入模板名称；不传时由服务端按模板包名称生成唯一名称 */
  importTemplateName?: string;
  /** 新建打印配置备注 */
  remark?: string;
}

/**
 * Tenant 复制官方模板包响应
 */
export interface CreatePrintingTemplatePackageCopyResponse {
  /** 新建导入模板 ID */
  importTemplateId: string;
  /** 新建导入模板名称 */
  importTemplateName: string;
}

/**
 * ERP 适配标签选项
 */
export interface ErpVendorOption {
  /** ERP 标签 code */
  code: string;
  /** ERP 标签展示名 */
  name: string;
}

/**
 * Admin 候选池查询
 */
export interface PrintingTemplateCandidateListQuery extends ListParams {
  /** 按 ERP 标签筛选 */
  erpVendor?: string;
}

/**
 * Admin 候选池列表项摘要
 */
export interface PrintingTemplateCandidateItem {
  /** 候选打印模板 ID */
  printerTemplateId: string;
  /** 所属租户名称 */
  tenantName: string;
  /** 关联导入模板名称 */
  importTemplateName: string;
  /** 关联导入模板 ERP 标签 code */
  erpVendor?: string;
  /** ERP 标签展示名 */
  erpVendorName?: string;
  /** 最近更新时间 */
  updatedAt: string;
}

export type PrintingTemplateCandidateListResponse = PaginatedResponse<PrintingTemplateCandidateItem>;

/**
 * Admin 候选详情
 */
export interface PrintingTemplateCandidateDetail {
  /** 候选打印模板 ID */
  printerTemplateId: string;
  /** 所属租户名称 */
  tenantName: string;
  /** 关联导入模板名称 */
  importTemplateName: string;
  /** 关联导入模板 ERP 标签 code */
  erpVendor?: string;
  /** ERP 标签展示名 */
  erpVendorName?: string;
  /** 导入系统默认字段快照 */
  defaultFields: OrderImportTemplateField[];
  /** 导入自定义字段快照 */
  customerFields: OrderImportTemplateField[];
  /** 打印配置黑盒 JSON */
  config: Record<string, unknown>;
}

/**
 * Admin 从候选创建模板包草稿请求
 */
export interface CreatePrintingTemplatePackageDraftFromCandidateRequest {
  /** 模板包名称 */
  name: string;
  /** 模板包说明 */
  description?: string;
  /** 可选 ERP 适配标签 code */
  erpVendor?: string;
  /** 预览图上传记录 ID */
  previewUploadId?: string;
  /** 标签 */
  tags?: string[];
}

/**
 * Admin 模板包管理列表查询
 */
export interface AdminPrintingTemplatePackageListQuery extends ListParams {
  /** 按状态筛选 */
  status?: PrintingTemplatePackageStatus;
  /** 按 ERP 标签筛选 */
  erpVendor?: string;
}

/**
 * Admin 模板包列表项
 */
export interface AdminPrintingTemplatePackageItem {
  /** 模板包 ID */
  id: string;
  /** 模板包名称 */
  name: string;
  /** 模板包说明 */
  description?: string;
  /** 可选 ERP 适配标签 code */
  erpVendor?: string;
  /** ERP 适配标签展示名 */
  erpVendorName?: string;
  /** 预览图公开访问 URL */
  previewImageUrl?: string | null;
  /** 标签 */
  tags?: string[];
  /** 模板包状态 */
  status: PrintingTemplatePackageStatus;
  /** 模板包版本 */
  version: number;
  /** 创建时间 */
  createdAt: string;
  /** 最近更新时间 */
  updatedAt: string;
  /** 发布时间 */
  publishedAt?: string | null;
}

export type AdminPrintingTemplatePackageListResponse = PaginatedResponse<AdminPrintingTemplatePackageItem>;

/**
 * Admin 模板包详情
 */
export interface AdminPrintingTemplatePackageDetail extends AdminPrintingTemplatePackageItem {
  /** 导入字段结构快照 */
  importTemplateSnapshot: PrintingTemplatePackageFieldSchema;
  /** 打印配置黑盒 JSON 快照 */
  printingConfigSnapshot: Record<string, unknown>;
}

/**
 * Admin 编辑模板包请求
 */
export interface UpdatePrintingTemplatePackageRequest {
  /** 模板包名称 */
  name?: string;
  /** 模板包说明 */
  description?: string;
  /** 可选 ERP 适配标签 code */
  erpVendor?: string;
  /** 预览图上传记录 ID；传字符串设置或替换，传 null 清空，不传不变更 */
  previewUploadId?: string | null;
  /** 标签 */
  tags?: string[];
}
