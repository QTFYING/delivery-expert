import { BadRequestException } from '@nestjs/common';
import { TenantGeneralSettings as TenantGeneralSettingsModel, UserRoleEnum as PrismaUserRoleEnum, UserStatusEnum } from '@prisma/client';
import type { TenantGeneralSettings, TenantSettingsUser, UpdateTenantGeneralSettingsRequest } from '@shou/types/contracts';
import { TenantRoleEnum, UserSimpleStatusEnum, type TenantRole } from '@shou/types/enums';
import { formatDateTime } from '../../common/validators';

const TENANT_ROLE_TO_PRISMA: Record<TenantRole, PrismaUserRoleEnum> = {
  [TenantRoleEnum.OWNER]: PrismaUserRoleEnum.TENANT_OWNER,
  [TenantRoleEnum.OPERATOR]: PrismaUserRoleEnum.TENANT_OPERATOR,
  [TenantRoleEnum.FINANCE]: PrismaUserRoleEnum.TENANT_FINANCE,
  [TenantRoleEnum.VIEWER]: PrismaUserRoleEnum.TENANT_VIEWER,
};

export function toTenantSettingsUser(user: {
  id: string;
  realName: string;
  phone: string | null;
  status: UserStatusEnum;
  loginAt: Date | null;
  roleAssignments: Array<{
    role: {
      id: string;
      code: string;
      name: string;
    };
  }>;
}): TenantSettingsUser {
  const assignment = user.roleAssignments[0];
  if (!assignment) {
    throw new BadRequestException('租户用户未绑定角色');
  }

  return {
    id: user.id,
    name: user.realName,
    roleId: assignment.role.id,
    roleCode: assignment.role.code,
    roleName: assignment.role.name,
    phone: user.phone ?? '',
    status: fromPrismaTenantUserStatus(user.status),
    lastLogin: formatDateTime(user.loginAt) ?? '',
  };
}

export function toTenantPrismaRole(role: TenantRole): PrismaUserRoleEnum {
  const prismaRole = TENANT_ROLE_TO_PRISMA[role];
  if (!prismaRole) {
    throw new BadRequestException('role 不是合法租户角色');
  }
  return prismaRole;
}

export function toLegacyPrismaTenantRole(roleCode: string): PrismaUserRoleEnum {
  if (Object.values(TenantRoleEnum).includes(roleCode as TenantRole)) {
    return toTenantPrismaRole(roleCode as TenantRole);
  }

  return PrismaUserRoleEnum.TENANT_VIEWER;
}

export function fromPrismaTenantUserStatus(status: UserStatusEnum): (typeof UserSimpleStatusEnum)[keyof typeof UserSimpleStatusEnum] {
  return status === UserStatusEnum.ACTIVE ? UserSimpleStatusEnum.ACTIVE : UserSimpleStatusEnum.DISABLED;
}

export function toPrismaTenantUserStatus(status: (typeof UserSimpleStatusEnum)[keyof typeof UserSimpleStatusEnum]): UserStatusEnum {
  return status === UserSimpleStatusEnum.ACTIVE ? UserStatusEnum.ACTIVE : UserStatusEnum.DISABLED;
}

export function getTenantPrismaRoles(): PrismaUserRoleEnum[] {
  return Object.values(TENANT_ROLE_TO_PRISMA);
}

export function mergeGeneralSettings(defaults: TenantGeneralSettings, override: TenantGeneralSettingsModel | null): TenantGeneralSettings {
  if (!override) {
    return defaults;
  }

  return {
    qrCodeExpiry: override.qrCodeExpiry ?? defaults.qrCodeExpiry,
    notifySeller: override.notifySeller ?? defaults.notifySeller,
    notifyOwner: override.notifyOwner ?? defaults.notifyOwner,
    notifyFinance: override.notifyFinance ?? defaults.notifyFinance,
    creditRemindDays: override.creditRemindDays ?? defaults.creditRemindDays,
    dailyReportPush: override.dailyReportPush ?? defaults.dailyReportPush,
  };
}

export function toTenantOverrideUpdate(request: UpdateTenantGeneralSettingsRequest) {
  const data: Partial<TenantGeneralSettingsModel> = {};

  if (request.qrCodeExpiry !== undefined) data.qrCodeExpiry = request.qrCodeExpiry;
  if (request.notifySeller !== undefined) data.notifySeller = request.notifySeller;
  if (request.notifyOwner !== undefined) data.notifyOwner = request.notifyOwner;
  if (request.notifyFinance !== undefined) data.notifyFinance = request.notifyFinance;
  if (request.creditRemindDays !== undefined) data.creditRemindDays = request.creditRemindDays;
  if (request.dailyReportPush !== undefined) data.dailyReportPush = request.dailyReportPush;

  return data;
}

export function parseNumberValue(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function parseBooleanValue(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) {
    return fallback;
  }

  if (raw === 'true') {
    return true;
  }

  if (raw === 'false') {
    return false;
  }

  return fallback;
}
