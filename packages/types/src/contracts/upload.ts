import type { UploadScene } from '../enums';

export interface CreateUploadPolicyRequest {
  /** 上传场景 */
  scene: UploadScene;
  /** 原始文件名，仅用于展示和扩展名校验 */
  fileName: string;
  /** 文件 MIME 类型 */
  contentType: string;
  /** 文件大小，单位字节 */
  size: number;
}

export interface UploadPolicyResponse {
  /** 上传记录 ID */
  uploadId: string;
  /** 上传场景 */
  scene: UploadScene;
  /** 上传方式 */
  method: 'post';
  /** 表单提交地址 */
  host: string;
  /** 服务端生成的 object key */
  objectKey: string;
  /** 公开访问 URL */
  publicUrl: string;
  /** 前端提交 OSS 表单时携带的字段 */
  formData: Record<string, string>;
  /** 上传凭证过期时间 */
  expiresAt: string;
}

export interface CompleteUploadResponse {
  /** 上传记录 ID */
  uploadId: string;
  /** 上传场景 */
  scene: UploadScene;
  /** OSS object key */
  objectKey: string;
  /** 公开访问 URL */
  publicUrl: string;
  /** 上传状态 */
  status: 'uploaded';
  /** 上传完成确认时间 */
  uploadedAt: string;
}
