import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { UploadObjectStatusEnum, UploadSceneEnum } from '@shou/types/enums';
import type { CompleteUploadResponse, CreateUploadPolicyRequest, UploadPolicyResponse } from '@shou/types/contracts';
import { Inject } from '@nestjs/common';
import * as crypto from 'crypto';
import dayjs from 'dayjs';
import { PrismaService } from '../prisma/prisma.service';
import { uploadConfig } from '../config/upload.config';
import { JwtPayload } from '../auth/decorators/current-user.decorator';
import { AliyunOssAdapter } from './aliyun-oss.adapter';
import { fromPrismaUploadScene, fromPrismaUploadStatus, toPrismaUploadScene, toPrismaUploadStatus } from './mapping/upload-enum.mapper';

const IMAGE_ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const IMAGE_EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const IMAGE_ALLOWED_FILE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

// 官方打印模板包预览图大小上限，统一用服务端常量，不进 env
const TEMPLATE_PACKAGE_PREVIEW_MAX_SIZE_BYTES = 2 * 1024 * 1024;
const TEMPLATE_PACKAGE_PREVIEW_KEY_PREFIX = 'template-packages/previews/';
const AVATAR_KEY_PREFIX = 'avatars/';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ossAdapter: AliyunOssAdapter,
    @Inject(uploadConfig.KEY)
    private readonly uploadSettings: ConfigType<typeof uploadConfig>,
  ) {}

  // 按当前登录态和上传场景签发 OSS 直传凭证
  async createPolicy(currentUser: JwtPayload, request: CreateUploadPolicyRequest): Promise<UploadPolicyResponse> {
    const maxSizeBytes = this.assertUploadRequest(currentUser, request);

    const uploadId = this.createUploadId();
    const objectKey = this.buildObjectKey(currentUser, request, uploadId);
    const publicUrl = this.ossAdapter.getPublicUrl(objectKey);
    const expiresAt = dayjs().add(this.uploadSettings.policyExpiresSeconds, 'second').toDate();
    const policy = this.ossAdapter.createPostPolicy({
      objectKey,
      contentType: request.contentType,
      maxSizeBytes,
      expiresAt,
    });

    await this.prisma.uploadObject.create({
      data: {
        id: uploadId,
        scene: toPrismaUploadScene(request.scene),
        tenantId: currentUser.tenantId,
        userId: currentUser.userId,
        objectKey,
        publicUrl,
        originalFileName: request.fileName,
        contentType: request.contentType,
        size: request.size,
        status: toPrismaUploadStatus(UploadObjectStatusEnum.ISSUED),
        expiresAt,
      },
    });

    return {
      uploadId,
      scene: request.scene,
      method: 'post',
      host: policy.host,
      objectKey,
      publicUrl,
      formData: policy.formData,
      expiresAt: expiresAt.toISOString(),
    };
  }

  // 确认当前用户的上传对象已到达 OSS 但不修改业务对象
  async completeUpload(currentUser: JwtPayload, uploadId: string): Promise<CompleteUploadResponse> {
    const upload = await this.prisma.uploadObject.findUnique({ where: { id: uploadId } });
    if (!upload || upload.userId !== currentUser.userId) {
      throw new BadRequestException('上传记录不存在');
    }

    const status = fromPrismaUploadStatus(upload.status);
    if (status !== UploadObjectStatusEnum.ISSUED) {
      throw new BadRequestException('上传记录状态不允许确认完成');
    }
    if (!dayjs(upload.expiresAt).isAfter(dayjs())) {
      throw new BadRequestException('上传凭证已过期');
    }

    const exists = await this.ossAdapter.objectExists(upload.objectKey);
    if (!exists) {
      throw new BadRequestException('上传对象不存在');
    }

    const uploadedAt = new Date();
    const updated = await this.prisma.uploadObject.update({
      where: { id: upload.id },
      data: {
        status: toPrismaUploadStatus(UploadObjectStatusEnum.UPLOADED),
        uploadedAt,
      },
    });

    return {
      uploadId: updated.id,
      scene: fromPrismaUploadScene(updated.scene),
      objectKey: updated.objectKey,
      publicUrl: updated.publicUrl,
      status: UploadObjectStatusEnum.UPLOADED,
      uploadedAt: uploadedAt.toISOString(),
    };
  }

  // 消费头像 uploadId 并更新当前用户头像指针 清空头像时传 null
  async updateUserAvatar(currentUser: JwtPayload, avatarUploadId: string | null | undefined): Promise<void> {
    if (avatarUploadId === undefined) {
      return;
    }

    const oldAvatarObjectKey = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: currentUser.userId },
        select: { avatarObjectKey: true },
      });
      if (!user) {
        throw new BadRequestException('当前用户不存在');
      }

      if (avatarUploadId === null) {
        await tx.user.update({ where: { id: currentUser.userId }, data: { avatarObjectKey: null } });
        return user.avatarObjectKey;
      }

      const upload = await tx.uploadObject.findUnique({ where: { id: avatarUploadId } });
      if (!upload || upload.userId !== currentUser.userId) {
        throw new BadRequestException('头像上传记录不存在');
      }
      if (fromPrismaUploadScene(upload.scene) !== UploadSceneEnum.USER_AVATAR) {
        throw new BadRequestException('上传场景不允许用于头像');
      }
      if (fromPrismaUploadStatus(upload.status) !== UploadObjectStatusEnum.UPLOADED) {
        throw new BadRequestException('头像上传尚未完成');
      }

      await tx.user.update({ where: { id: currentUser.userId }, data: { avatarObjectKey: upload.objectKey } });
      await tx.uploadObject.update({
        where: { id: upload.id },
        data: {
          status: toPrismaUploadStatus(UploadObjectStatusEnum.USED),
          usedAt: new Date(),
        },
      });

      return user.avatarObjectKey;
    });

    await this.deleteOldAvatarIfUnreferenced(oldAvatarObjectKey);
  }

  // 将 OSS object key 投影为公开 URL 空值保持为 null
  buildPublicUrl(objectKey: string | null): string | null {
    return objectKey ? this.ossAdapter.getPublicUrl(objectKey) : null;
  }

  // 按上传场景校验图片规则并返回该场景大小上限 头像任意用户可上传 预览图仅平台用户
  private assertUploadRequest(currentUser: JwtPayload, request: CreateUploadPolicyRequest): number {
    const maxSizeBytes = this.resolveSceneMaxSizeBytes(currentUser, request.scene);
    if (!IMAGE_ALLOWED_CONTENT_TYPES.has(request.contentType)) {
      throw new BadRequestException('图片文件类型不支持');
    }
    if (request.size > maxSizeBytes) {
      throw new BadRequestException('图片文件大小超过限制');
    }
    const extension = this.getFileExtension(request.fileName);
    if (!extension || !IMAGE_ALLOWED_FILE_EXTENSIONS.has(extension)) {
      throw new BadRequestException('图片文件扩展名不支持');
    }
    return maxSizeBytes;
  }

  // 解析上传场景的大小上限并校验场景级权限边界
  private resolveSceneMaxSizeBytes(currentUser: JwtPayload, scene: CreateUploadPolicyRequest['scene']): number {
    if (scene === UploadSceneEnum.USER_AVATAR) {
      return this.uploadSettings.avatarMaxSizeBytes;
    }
    if (scene === UploadSceneEnum.TEMPLATE_PACKAGE_PREVIEW) {
      if (currentUser.tenantId) {
        throw new BadRequestException('当前登录态无权上传模板包预览图');
      }
      return TEMPLATE_PACKAGE_PREVIEW_MAX_SIZE_BYTES;
    }
    throw new BadRequestException('上传场景暂不支持');
  }

  // 根据登录态与场景生成 object key 前端不得传入 key 或 tenant 信息
  private buildObjectKey(currentUser: JwtPayload, request: CreateUploadPolicyRequest, uploadId: string): string {
    const extension = IMAGE_EXTENSION_BY_CONTENT_TYPE[request.contentType];
    if (request.scene === UploadSceneEnum.TEMPLATE_PACKAGE_PREVIEW) {
      return `${TEMPLATE_PACKAGE_PREVIEW_KEY_PREFIX}${uploadId}.${extension}`;
    }
    const tenantSegment = currentUser.tenantId ?? 'os';
    return `${AVATAR_KEY_PREFIX}${tenantSegment}/${uploadId}.${extension}`;
  }

  // 供模板包模块消费预览图 uploadId 校验场景 状态 上传人后返回 object key
  async resolveTemplatePackagePreviewObjectKey(currentUser: JwtPayload, previewUploadId: string): Promise<string> {
    if (currentUser.tenantId) {
      throw new BadRequestException('当前登录态无权使用模板包预览图');
    }
    const upload = await this.prisma.uploadObject.findUnique({ where: { id: previewUploadId } });
    if (!upload || upload.userId !== currentUser.userId) {
      throw new BadRequestException('预览图上传记录不存在');
    }
    if (fromPrismaUploadScene(upload.scene) !== UploadSceneEnum.TEMPLATE_PACKAGE_PREVIEW) {
      throw new BadRequestException('上传场景不允许用于模板包预览图');
    }
    if (fromPrismaUploadStatus(upload.status) !== UploadObjectStatusEnum.UPLOADED) {
      throw new BadRequestException('预览图上传尚未完成');
    }
    return upload.objectKey;
  }

  // 标记预览图上传记录为已消费
  async markTemplatePackagePreviewUsed(previewUploadId: string): Promise<void> {
    await this.prisma.uploadObject.updateMany({
      where: { id: previewUploadId },
      data: {
        status: toPrismaUploadStatus(UploadObjectStatusEnum.USED),
        usedAt: new Date(),
      },
    });
  }

  // 删除被替换或清空的模板包预览图 删除前确认无人引用 删除失败只记录日志
  async deleteTemplatePackagePreviewIfUnreferenced(oldObjectKey: string | null, newObjectKey: string | null): Promise<void> {
    if (!oldObjectKey || !oldObjectKey.startsWith(TEMPLATE_PACKAGE_PREVIEW_KEY_PREFIX)) {
      return;
    }
    if (oldObjectKey === newObjectKey) {
      return;
    }

    const referencedCount = await this.prisma.printingTemplatePackage.count({ where: { previewObjectKey: oldObjectKey } });
    if (referencedCount > 0) {
      return;
    }

    try {
      await this.ossAdapter.deleteObject(oldObjectKey);
    } catch (error) {
      this.logger.warn(`旧模板包预览图删除失败但不影响模板包更新: key=${oldObjectKey}, error=${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 生成上传记录 ID 使用固定前缀便于审计识别
  private createUploadId(): string {
    return `upl_${crypto.randomUUID().replace(/-/g, '')}`;
  }

  // 提取文件扩展名并统一小写
  private getFileExtension(fileName: string): string | null {
    const index = fileName.lastIndexOf('.');
    if (index < 0 || index === fileName.length - 1) {
      return null;
    }
    return fileName.slice(index + 1).toLowerCase();
  }

  // 删除旧头像前确认无人引用 删除失败只记录日志
  private async deleteOldAvatarIfUnreferenced(objectKey: string | null): Promise<void> {
    if (!objectKey || !objectKey.startsWith(AVATAR_KEY_PREFIX)) {
      return;
    }

    const referencedCount = await this.prisma.user.count({ where: { avatarObjectKey: objectKey } });
    if (referencedCount > 0) {
      return;
    }

    try {
      await this.ossAdapter.deleteObject(objectKey);
    } catch (error) {
      this.logger.warn(`旧头像删除失败但不影响新头像生效: key=${objectKey}, error=${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
