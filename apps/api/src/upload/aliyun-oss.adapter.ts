import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as crypto from 'crypto';
import { BusinessException } from '../common/exceptions/business.exception';
import { uploadConfig } from '../config/upload.config';

interface CreatePostPolicyInput {
  objectKey: string;
  contentType: string;
  maxSizeBytes: number;
  expiresAt: Date;
}

interface CreatePostPolicyResult {
  host: string;
  formData: Record<string, string>;
}

@Injectable()
export class AliyunOssAdapter {
  private readonly logger = new Logger(AliyunOssAdapter.name);

  constructor(
    @Inject(uploadConfig.KEY)
    private readonly uploadSettings: ConfigType<typeof uploadConfig>,
  ) {}

  // 生成 OSS Browser POST Object 所需的 policy 和签名字段
  createPostPolicy(input: CreatePostPolicyInput): CreatePostPolicyResult {
    this.assertConfigured();

    const policy = {
      expiration: input.expiresAt.toISOString(),
      conditions: [
        ['content-length-range', 1, input.maxSizeBytes],
        ['eq', '$key', input.objectKey],
        ['eq', '$Content-Type', input.contentType],
        ['eq', '$x-oss-object-acl', 'public-read'],
      ],
    };
    const encodedPolicy = Buffer.from(JSON.stringify(policy)).toString('base64');
    const signature = crypto.createHmac('sha1', this.uploadSettings.aliyunAccessKeySecret).update(encodedPolicy).digest('base64');

    return {
      host: this.getPostHost(),
      formData: {
        key: input.objectKey,
        policy: encodedPolicy,
        OSSAccessKeyId: this.uploadSettings.aliyunAccessKeyId,
        signature,
        'Content-Type': input.contentType,
        'x-oss-object-acl': 'public-read',
        success_action_status: '200',
      },
    };
  }

  // 通过 OSS HEAD 判断 object 是否已经由前端直传成功
  async objectExists(objectKey: string): Promise<boolean> {
    this.assertConfigured();

    const requestDate = new Date().toUTCString();
    const response = await fetch(this.getObjectUrl(objectKey), {
      method: 'HEAD',
      headers: {
        Authorization: this.buildAuthorization('HEAD', objectKey, requestDate),
        Date: requestDate,
      },
    });
    if (response.status === 404) {
      return false;
    }
    if (!response.ok) {
      this.logger.warn(`OSS HEAD 对象失败: status=${response.status}, key=${objectKey}`);
      throw new BusinessException(50003, '上传对象确认失败', 502);
    }
    return true;
  }

  // 删除指定 OSS object 删除失败交给调用方决定是否吞掉
  async deleteObject(objectKey: string): Promise<void> {
    this.assertConfigured();

    const requestDate = new Date().toUTCString();
    const response = await fetch(this.getObjectUrl(objectKey), {
      method: 'DELETE',
      headers: {
        Authorization: this.buildDeleteAuthorization(objectKey, requestDate),
        Date: requestDate,
      },
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`OSS 删除对象失败: status=${response.status}, key=${objectKey}`);
    }
  }

  // 拼接公开访问 URL 统一去除多余斜杠
  getPublicUrl(objectKey: string): string {
    return `${this.uploadSettings.publicBaseUrl}/${objectKey}`;
  }

  // 校验 OSS 上传所需配置完整性
  private assertConfigured(): void {
    if (
      !this.uploadSettings.bucket ||
      !this.uploadSettings.endpoint ||
      !this.uploadSettings.publicBaseUrl ||
      !this.uploadSettings.aliyunAccessKeyId ||
      !this.uploadSettings.aliyunAccessKeySecret
    ) {
      throw new BusinessException(50004, 'OSS 上传配置不完整', 500);
    }
  }

  // 生成前端 POST 到 OSS 的 host
  private getPostHost(): string {
    const endpoint = this.uploadSettings.endpoint.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return `https://${this.uploadSettings.bucket}.${endpoint}`;
  }

  // 生成对象访问 URL 供 HEAD / DELETE 使用
  private getObjectUrl(objectKey: string): string {
    return `${this.getPostHost()}/${encodeObjectKey(objectKey)}`;
  }

  // 生成 OSS 删除对象签名 使用经典 HMAC-SHA1 Header 签名
  private buildDeleteAuthorization(objectKey: string, requestDate: string): string {
    return this.buildAuthorization('DELETE', objectKey, requestDate);
  }

  // 生成 OSS Header 签名 用于服务端确认和清理对象
  private buildAuthorization(
    method: 'HEAD' | 'DELETE',
    objectKey: string,
    requestDate: string,
  ): string {
    const resource = `/${this.uploadSettings.bucket}/${objectKey}`;
    const canonical = `${method}\n\n\n${requestDate}\n${resource}`;
    const signature = crypto.createHmac('sha1', this.uploadSettings.aliyunAccessKeySecret).update(canonical).digest('base64');
    return `OSS ${this.uploadSettings.aliyunAccessKeyId}:${signature}`;
  }
}

function encodeObjectKey(objectKey: string): string {
  return objectKey
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}
