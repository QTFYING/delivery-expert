import type { EnumValue } from './common';

/**
 * 通用上传场景
 */
export const UploadSceneEnum = {
  /** 当前登录用户头像 */
  USER_AVATAR: 'user_avatar',
  /** 官方打印模板包预览图，仅平台用户可上传 */
  TEMPLATE_PACKAGE_PREVIEW: 'template_package_preview',
} as const;

export type UploadScene = EnumValue<typeof UploadSceneEnum>;

/**
 * 上传对象生命周期状态
 */
export const UploadObjectStatusEnum = {
  /** 已签发直传凭证 */
  ISSUED: 'issued',
  /** OSS 对象已确认上传完成 */
  UPLOADED: 'uploaded',
  /** 已被业务对象消费 */
  USED: 'used',
  /** 上传记录已过期 */
  EXPIRED: 'expired',
  /** 上传对象或记录已清理 */
  DELETED: 'deleted',
} as const;

export type UploadObjectStatus = EnumValue<typeof UploadObjectStatusEnum>;
