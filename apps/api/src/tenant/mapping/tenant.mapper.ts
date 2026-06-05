import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  PaymentChannelEnum as PrismaPaymentChannelEnum,
  Prisma,
  TenantCertificationStatusEnum as PrismaTenantCertificationStatusEnum,
  TenantSoftwareVersionEnum as PrismaTenantSoftwareVersionEnum,
  TenantStatusEnum as PrismaTenantStatusEnum,
  UserRoleEnum as PrismaUserRoleEnum,
  UserStatusEnum as PrismaUserStatusEnum,
} from '@prisma/client';
import type { TenantMemberItem, TenantProfile, TenantRecordItem, UserRecordItem } from '@shou/types/contracts';
import {
  PaymentChannelEnum,
  ReviewActionEnum,
  TenantCertificationStatusEnum,
  TenantRoleEnum,
  TenantSideEnum,
  TenantSoftwareVersionEnum,
  TenantStatusEnum,
  UserRoleEnum,
  UserStatusEnum,
  type TenantCertificationStatus,
  type TenantRole,
  type TenantSoftwareVersion,
  type TenantStatus,
  type UserRole,
  type UserStatus,
} from '@shou/types/enums';
import dayjs from 'dayjs';
import Decimal from 'decimal.js';

const PRISMA_PAYMENT_CHANNEL_TO_CONTRACT: Record<PrismaPaymentChannelEnum, (typeof PaymentChannelEnum)[keyof typeof PaymentChannelEnum]> = {
  [PrismaPaymentChannelEnum.LAKALA]: PaymentChannelEnum.LAKALA,
  [PrismaPaymentChannelEnum.SHOUQIANBA]: PaymentChannelEnum.SHOUQIANBA,
  [PrismaPaymentChannelEnum.PINGAN_BANK]: PaymentChannelEnum.PINGAN_BANK,
};

export function resolveDueInDays(serviceExpireAt: Date | null): number | null {
  if (!serviceExpireAt) return null;
  return dayjs(serviceExpireAt).endOf('day').diff(dayjs().startOf('day'), 'day');
}

export function fromPrismaPaymentChannel(
  channel: PrismaPaymentChannelEnum | null,
): (typeof PaymentChannelEnum)[keyof typeof PaymentChannelEnum] | null {
  return channel ? PRISMA_PAYMENT_CHANNEL_TO_CONTRACT[channel] : null;
}

const PRISMA_TO_CERTIFICATION_STATUS: Record<PrismaTenantCertificationStatusEnum, TenantCertificationStatus> = {
  [PrismaTenantCertificationStatusEnum.PENDING_INITIAL_REVIEW]: TenantCertificationStatusEnum.PENDING_INITIAL_REVIEW,
  [PrismaTenantCertificationStatusEnum.PENDING_SECONDARY_REVIEW]: TenantCertificationStatusEnum.PENDING_SECONDARY_REVIEW,
  [PrismaTenantCertificationStatusEnum.PENDING_CONFIRMATION]: TenantCertificationStatusEnum.PENDING_CONFIRMATION,
  [PrismaTenantCertificationStatusEnum.APPROVED]: TenantCertificationStatusEnum.APPROVED,
  [PrismaTenantCertificationStatusEnum.REJECTED]: TenantCertificationStatusEnum.REJECTED,
};

const CERTIFICATION_STATUS_TO_PRISMA: Record<TenantCertificationStatus, PrismaTenantCertificationStatusEnum> = {
  [TenantCertificationStatusEnum.PENDING_INITIAL_REVIEW]: PrismaTenantCertificationStatusEnum.PENDING_INITIAL_REVIEW,
  [TenantCertificationStatusEnum.PENDING_SECONDARY_REVIEW]: PrismaTenantCertificationStatusEnum.PENDING_SECONDARY_REVIEW,
  [TenantCertificationStatusEnum.PENDING_CONFIRMATION]: PrismaTenantCertificationStatusEnum.PENDING_CONFIRMATION,
  [TenantCertificationStatusEnum.APPROVED]: PrismaTenantCertificationStatusEnum.APPROVED,
  [TenantCertificationStatusEnum.REJECTED]: PrismaTenantCertificationStatusEnum.REJECTED,
};

const PRISMA_TO_TENANT_STATUS: Record<PrismaTenantStatusEnum, TenantStatus> = {
  [PrismaTenantStatusEnum.ACTIVE]: TenantStatusEnum.ACTIVE,
  [PrismaTenantStatusEnum.ONBOARDING]: TenantStatusEnum.ONBOARDING,
  [PrismaTenantStatusEnum.ATTENTION]: TenantStatusEnum.ATTENTION,
  [PrismaTenantStatusEnum.PAUSED]: TenantStatusEnum.PAUSED,
};

const TENANT_STATUS_TO_PRISMA: Record<TenantStatus, PrismaTenantStatusEnum> = {
  [TenantStatusEnum.ACTIVE]: PrismaTenantStatusEnum.ACTIVE,
  [TenantStatusEnum.ONBOARDING]: PrismaTenantStatusEnum.ONBOARDING,
  [TenantStatusEnum.ATTENTION]: PrismaTenantStatusEnum.ATTENTION,
  [TenantStatusEnum.PAUSED]: PrismaTenantStatusEnum.PAUSED,
};

const PRISMA_TO_TENANT_SOFTWARE_VERSION: Record<PrismaTenantSoftwareVersionEnum, TenantSoftwareVersion> = {
  [PrismaTenantSoftwareVersionEnum.L1]: TenantSoftwareVersionEnum.L1,
  [PrismaTenantSoftwareVersionEnum.L2]: TenantSoftwareVersionEnum.L2,
  [PrismaTenantSoftwareVersionEnum.L3]: TenantSoftwareVersionEnum.L3,
};

const TENANT_SOFTWARE_VERSION_TO_PRISMA: Record<TenantSoftwareVersion, PrismaTenantSoftwareVersionEnum> = {
  [TenantSoftwareVersionEnum.L1]: PrismaTenantSoftwareVersionEnum.L1,
  [TenantSoftwareVersionEnum.L2]: PrismaTenantSoftwareVersionEnum.L2,
  [TenantSoftwareVersionEnum.L3]: PrismaTenantSoftwareVersionEnum.L3,
};

const TENANT_SOFTWARE_VERSION_TO_NAME: Record<TenantSoftwareVersion, string> = {
  [TenantSoftwareVersionEnum.L1]: '基础版',
  [TenantSoftwareVersionEnum.L2]: '标准版',
  [TenantSoftwareVersionEnum.L3]: '高级版',
};

const PRISMA_TO_USER_STATUS: Record<PrismaUserStatusEnum, UserStatus> = {
  [PrismaUserStatusEnum.ACTIVE]: UserStatusEnum.ACTIVE,
  [PrismaUserStatusEnum.INVITED]: UserStatusEnum.INVITED,
  [PrismaUserStatusEnum.LOCKED]: UserStatusEnum.LOCKED,
  [PrismaUserStatusEnum.DISABLED]: UserStatusEnum.DISABLED,
};

const USER_STATUS_TO_PRISMA: Record<UserStatus, PrismaUserStatusEnum> = {
  [UserStatusEnum.ACTIVE]: PrismaUserStatusEnum.ACTIVE,
  [UserStatusEnum.INVITED]: PrismaUserStatusEnum.INVITED,
  [UserStatusEnum.LOCKED]: PrismaUserStatusEnum.LOCKED,
  [UserStatusEnum.DISABLED]: PrismaUserStatusEnum.DISABLED,
};

const PRISMA_TO_USER_ROLE: Record<PrismaUserRoleEnum, UserRole> = {
  [PrismaUserRoleEnum.OS_SUPER_ADMIN]: UserRoleEnum.OS_SUPER_ADMIN,
  [PrismaUserRoleEnum.TENANT_OWNER]: UserRoleEnum.TENANT_OWNER,
  [PrismaUserRoleEnum.TENANT_OPERATOR]: UserRoleEnum.TENANT_OPERATOR,
  [PrismaUserRoleEnum.TENANT_FINANCE]: UserRoleEnum.TENANT_FINANCE,
  [PrismaUserRoleEnum.TENANT_VIEWER]: UserRoleEnum.TENANT_VIEWER,
};

const USER_ROLE_TO_PRISMA: Record<UserRole, PrismaUserRoleEnum> = {
  [UserRoleEnum.OS_SUPER_ADMIN]: PrismaUserRoleEnum.OS_SUPER_ADMIN,
  [UserRoleEnum.TENANT_OWNER]: PrismaUserRoleEnum.TENANT_OWNER,
  [UserRoleEnum.TENANT_OPERATOR]: PrismaUserRoleEnum.TENANT_OPERATOR,
  [UserRoleEnum.TENANT_FINANCE]: PrismaUserRoleEnum.TENANT_FINANCE,
  [UserRoleEnum.TENANT_VIEWER]: PrismaUserRoleEnum.TENANT_VIEWER,
};

const TENANT_ROLE_TO_PRISMA: Record<TenantRole, PrismaUserRoleEnum> = {
  [TenantRoleEnum.OWNER]: PrismaUserRoleEnum.TENANT_OWNER,
  [TenantRoleEnum.OPERATOR]: PrismaUserRoleEnum.TENANT_OPERATOR,
  [TenantRoleEnum.FINANCE]: PrismaUserRoleEnum.TENANT_FINANCE,
  [TenantRoleEnum.VIEWER]: PrismaUserRoleEnum.TENANT_VIEWER,
};

const NEXT_APPROVED_CERTIFICATION_STATUS: Partial<Record<TenantCertificationStatus, TenantCertificationStatus>> = {
  [TenantCertificationStatusEnum.PENDING_INITIAL_REVIEW]: TenantCertificationStatusEnum.PENDING_SECONDARY_REVIEW,
  [TenantCertificationStatusEnum.PENDING_SECONDARY_REVIEW]: TenantCertificationStatusEnum.PENDING_CONFIRMATION,
  [TenantCertificationStatusEnum.PENDING_CONFIRMATION]: TenantCertificationStatusEnum.APPROVED,
};

export function fromPrismaCertificationStatus(status: PrismaTenantCertificationStatusEnum): TenantCertificationStatus {
  return PRISMA_TO_CERTIFICATION_STATUS[status] ?? TenantCertificationStatusEnum.PENDING_INITIAL_REVIEW;
}

export function toPrismaCertificationStatus(status: TenantCertificationStatus): PrismaTenantCertificationStatusEnum {
  return CERTIFICATION_STATUS_TO_PRISMA[status] ?? PrismaTenantCertificationStatusEnum.PENDING_INITIAL_REVIEW;
}

export function fromPrismaTenantStatus(status: PrismaTenantStatusEnum): TenantStatus {
  return PRISMA_TO_TENANT_STATUS[status] ?? TenantStatusEnum.ACTIVE;
}

export function toPrismaTenantStatus(status: TenantStatus): PrismaTenantStatusEnum {
  return TENANT_STATUS_TO_PRISMA[status] ?? PrismaTenantStatusEnum.ACTIVE;
}

export function fromPrismaTenantSoftwareVersion(version: PrismaTenantSoftwareVersionEnum): TenantSoftwareVersion {
  return PRISMA_TO_TENANT_SOFTWARE_VERSION[version] ?? TenantSoftwareVersionEnum.L1;
}

export function resolveTenantSoftwareName(version: TenantSoftwareVersion): string {
  return TENANT_SOFTWARE_VERSION_TO_NAME[version] ?? TENANT_SOFTWARE_VERSION_TO_NAME[TenantSoftwareVersionEnum.L1];
}

export function resolveTenantSoftwareNameFromPrisma(version: PrismaTenantSoftwareVersionEnum): string {
  return resolveTenantSoftwareName(fromPrismaTenantSoftwareVersion(version));
}

export function toPrismaTenantSoftwareVersion(version: TenantSoftwareVersion): PrismaTenantSoftwareVersionEnum {
  const prismaVersion = TENANT_SOFTWARE_VERSION_TO_PRISMA[version];
  if (!prismaVersion) {
    throw new BadRequestException('softwareVersion 不是合法软件版本');
  }
  return prismaVersion;
}

export function fromPrismaUserStatus(status: PrismaUserStatusEnum): UserStatus {
  return PRISMA_TO_USER_STATUS[status] ?? UserStatusEnum.ACTIVE;
}

export function toPrismaUserStatus(status: UserStatus): PrismaUserStatusEnum {
  return USER_STATUS_TO_PRISMA[status] ?? PrismaUserStatusEnum.ACTIVE;
}

export function fromPrismaUserRole(role: PrismaUserRoleEnum): UserRole {
  return PRISMA_TO_USER_ROLE[role];
}

export function toPrismaUserRole(role: UserRole): PrismaUserRoleEnum {
  const prismaRole = USER_ROLE_TO_PRISMA[role];
  if (!prismaRole) {
    throw new BadRequestException('role 不是合法用户角色');
  }
  return prismaRole;
}

export function resolveUserRoleForUpsert(tenantType: string, role: string): PrismaUserRoleEnum {
  if (tenantType === TenantSideEnum.PLATFORM) {
    if (role !== UserRoleEnum.OS_SUPER_ADMIN) {
      throw new BadRequestException('平台侧当前仅支持 OS_SUPER_ADMIN');
    }
    return PrismaUserRoleEnum.OS_SUPER_ADMIN;
  }

  const tenantRole = Object.values(TenantRoleEnum).includes(role as TenantRole) ? (role as TenantRole) : null;
  if (!tenantRole) {
    throw new BadRequestException('role 不是合法租户角色');
  }
  return TENANT_ROLE_TO_PRISMA[tenantRole];
}

export function getNextCertificationStatus(currentStatus: TenantCertificationStatus, action: string): TenantCertificationStatus {
  if (action === ReviewActionEnum.REJECT) {
    return TenantCertificationStatusEnum.REJECTED;
  }
  if (action !== ReviewActionEnum.APPROVE) {
    throw new BadRequestException('action 不是合法审核动作');
  }

  const nextStatus = NEXT_APPROVED_CERTIFICATION_STATUS[currentStatus];
  if (!nextStatus) {
    throw new ConflictException('当前资质状态不允许继续审核');
  }
  return nextStatus;
}

export function toTenantRecordItem(tenant: {
  id: string;
  name: string;
  softwareVersion: PrismaTenantSoftwareVersionEnum;
  adminName: string | null;
  address: string | null;
  licenseNo: string | null;
  activePaymentChannel: PrismaPaymentChannelEnum | null;
  status: PrismaTenantStatusEnum;
  rejectReason: string | null;
  freezeReason: string | null;
  serviceExpireAt: Date | null;
  updatedAt: Date;
  users: Array<{
    id: string;
    account: string;
    realName: string;
    role: PrismaUserRoleEnum;
    loginAt: Date | null;
    createdAt: Date;
  }>;
  payments: Array<{ amount: Prisma.Decimal }>;
}): TenantRecordItem {
  const monthlyFlow = tenant.payments.reduce((sum, item) => sum.plus(item.amount.toString()), new Decimal(0));
  const owner = tenant.users
    .filter((item) => item.role === PrismaUserRoleEnum.TENANT_OWNER)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  const lastActiveAt = tenant.users
    .map((item) => item.loginAt)
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return {
    id: tenant.id,
    name: tenant.name,
    softwareName: resolveTenantSoftwareNameFromPrisma(tenant.softwareVersion),
    softwareVersion: fromPrismaTenantSoftwareVersion(tenant.softwareVersion),
    ownerName: owner?.realName || tenant.adminName || '',
    ownerAccount: owner?.account ?? null,
    address: tenant.address ?? '',
    licenseNo: tenant.licenseNo ?? '',
    users: tenant.users.length,
    activePaymentChannel: fromPrismaPaymentChannel(tenant.activePaymentChannel),
    monthlyFlow: Number(monthlyFlow.toFixed(2)),
    serviceExpireAt: tenant.serviceExpireAt?.toISOString() ?? null,
    dueInDays: resolveDueInDays(tenant.serviceExpireAt),
    lastActiveAt: (lastActiveAt ?? tenant.updatedAt).toISOString(),
    status: fromPrismaTenantStatus(tenant.status),
    rejectReason: tenant.rejectReason ?? null,
    freezeReason: tenant.freezeReason ?? null,
  };
}

export function toTenantProfile(tenant: {
  id: string;
  name: string;
  address: string | null;
  licenseNo: string | null;
  contactPhone: string;
  softwareVersion: PrismaTenantSoftwareVersionEnum;
  adminName: string | null;
  status: PrismaTenantStatusEnum;
  rejectReason: string | null;
  freezeReason: string | null;
  serviceExpireAt: Date | null;
  maxCreditDays: number;
  creditRemindDays: number;
  createdAt: Date;
  updatedAt: Date;
}): TenantProfile {
  return {
    id: tenant.id,
    name: tenant.name,
    softwareName: resolveTenantSoftwareNameFromPrisma(tenant.softwareVersion),
    softwareVersion: fromPrismaTenantSoftwareVersion(tenant.softwareVersion),
    address: tenant.address ?? '',
    licenseNo: tenant.licenseNo ?? '',
    contactPhone: tenant.contactPhone,
    ownerName: tenant.adminName,
    status: fromPrismaTenantStatus(tenant.status),
    rejectReason: tenant.rejectReason,
    freezeReason: tenant.freezeReason,
    serviceExpireAt: tenant.serviceExpireAt?.toISOString() ?? null,
    maxCreditDays: tenant.maxCreditDays,
    creditRemindDays: tenant.creditRemindDays,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  };
}

export function toUserRecordItem(user: {
  id: string;
  account: string;
  realName: string;
  phone: string | null;
  tenantId: string | null;
  tenant: { name: string } | null;
  role: PrismaUserRoleEnum;
  scope: string | null;
  status: PrismaUserStatusEnum;
  loginAt: Date | null;
  requiresPasswordReset: boolean;
}): UserRecordItem {
  return {
    id: user.id,
    account: user.account,
    name: user.realName,
    tenant: user.tenant?.name ?? '平台',
    tenantType: user.tenantId ? TenantSideEnum.TENANT : TenantSideEnum.PLATFORM,
    role: fromPrismaUserRole(user.role),
    scope: user.scope ?? '',
    phone: user.phone ?? '',
    status: fromPrismaUserStatus(user.status),
    loginAt: user.loginAt?.toISOString() ?? '',
    requiresPasswordReset: user.requiresPasswordReset,
  };
}

export function toTenantMemberItem(user: {
  id: string;
  realName: string;
  account: string;
  tenantId: string | null;
  tenant: { name: string } | null;
  role: PrismaUserRoleEnum;
  scope: string | null;
  status: PrismaUserStatusEnum;
}): TenantMemberItem {
  return {
    id: user.id,
    name: user.realName,
    account: user.account,
    tenant: user.tenant?.name ?? '平台',
    tenantType: user.tenantId ? TenantSideEnum.TENANT : TenantSideEnum.PLATFORM,
    role: fromPrismaUserRole(user.role),
    status: fromPrismaUserStatus(user.status),
    scope: user.scope ?? '',
  };
}
