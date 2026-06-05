import { registerAs } from '@nestjs/config';

const DEFAULT_POLICY_EXPIRES_SECONDS = 600;
const DEFAULT_AVATAR_MAX_SIZE_BYTES = 80 * 1024;

export const uploadConfig = registerAs('upload', () => {
  const publicBaseUrl = process.env.OSS_PUBLIC_BASE_URL?.trim() || '';

  return {
    bucket: process.env.OSS_BUCKET?.trim() || '',
    region: process.env.OSS_REGION?.trim() || '',
    endpoint: process.env.OSS_ENDPOINT?.trim() || '',
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ''),
    policyExpiresSeconds: Number.parseInt(process.env.OSS_POLICY_EXPIRES_SECONDS || String(DEFAULT_POLICY_EXPIRES_SECONDS), 10),
    avatarMaxSizeBytes: Number.parseInt(process.env.OSS_AVATAR_MAX_SIZE_BYTES || String(DEFAULT_AVATAR_MAX_SIZE_BYTES), 10),
    aliyunAccessKeyId: process.env.ALIYUN_ACCESS_KEY_ID?.trim() || '',
    aliyunAccessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET?.trim() || '',
  };
});
