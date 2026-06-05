import { UploadObjectStatus as PrismaUploadObjectStatus, UploadSceneEnum as PrismaUploadSceneEnum } from '@prisma/client';
import { UploadObjectStatusEnum, UploadSceneEnum, type UploadObjectStatus, type UploadScene } from '@shou/types/enums';

const UPLOAD_SCENE_TO_PRISMA: Record<UploadScene, PrismaUploadSceneEnum> = {
  [UploadSceneEnum.USER_AVATAR]: PrismaUploadSceneEnum.USER_AVATAR,
};

const UPLOAD_SCENE_FROM_PRISMA: Record<PrismaUploadSceneEnum, UploadScene> = {
  [PrismaUploadSceneEnum.USER_AVATAR]: UploadSceneEnum.USER_AVATAR,
};

const UPLOAD_STATUS_TO_PRISMA: Record<UploadObjectStatus, PrismaUploadObjectStatus> = {
  [UploadObjectStatusEnum.ISSUED]: PrismaUploadObjectStatus.ISSUED,
  [UploadObjectStatusEnum.UPLOADED]: PrismaUploadObjectStatus.UPLOADED,
  [UploadObjectStatusEnum.USED]: PrismaUploadObjectStatus.USED,
  [UploadObjectStatusEnum.EXPIRED]: PrismaUploadObjectStatus.EXPIRED,
  [UploadObjectStatusEnum.DELETED]: PrismaUploadObjectStatus.DELETED,
};

const UPLOAD_STATUS_FROM_PRISMA: Record<PrismaUploadObjectStatus, UploadObjectStatus> = {
  [PrismaUploadObjectStatus.ISSUED]: UploadObjectStatusEnum.ISSUED,
  [PrismaUploadObjectStatus.UPLOADED]: UploadObjectStatusEnum.UPLOADED,
  [PrismaUploadObjectStatus.USED]: UploadObjectStatusEnum.USED,
  [PrismaUploadObjectStatus.EXPIRED]: UploadObjectStatusEnum.EXPIRED,
  [PrismaUploadObjectStatus.DELETED]: UploadObjectStatusEnum.DELETED,
};

export function toPrismaUploadScene(scene: UploadScene): PrismaUploadSceneEnum {
  return UPLOAD_SCENE_TO_PRISMA[scene];
}

export function fromPrismaUploadScene(scene: PrismaUploadSceneEnum): UploadScene {
  return UPLOAD_SCENE_FROM_PRISMA[scene];
}

export function toPrismaUploadStatus(status: UploadObjectStatus): PrismaUploadObjectStatus {
  return UPLOAD_STATUS_TO_PRISMA[status];
}

export function fromPrismaUploadStatus(status: PrismaUploadObjectStatus): UploadObjectStatus {
  return UPLOAD_STATUS_FROM_PRISMA[status];
}
