import {
  Prisma,
  OrderImportConflictPolicyEnum as PrismaImportConflictPolicyEnum,
  OrderImportJobStatusEnum as PrismaImportJobStatusEnum,
  OrderPayTypeEnum as PrismaOrderPayTypeEnum,
  OrderStatusEnum as PrismaOrderStatusEnum,
} from '@prisma/client';
import type {
  OrderImportJobConflictDetail,
  OrderImportJobFailure,
  OrderImportTemplate,
  OrderImportTemplateField,
  OrderImportTemplateMutationResponse,
} from '@shou/types/contracts';
import {
  OrderImportConflictPolicyEnum,
  OrderImportJobStatusEnum,
  OrderPayTypeEnum,
  OrderStatusEnum,
  type OrderImportJobStatus,
  type OrderPayType,
  type OrderStatus,
} from '@shou/types/enums';
import Decimal from 'decimal.js';
import { normalizeOptionalText } from '../../common/validators';
import { resolveDefaultTemplateFieldValueRequired } from '../import-template.fields';

const IMPORT_JOB_STATUS_TEXT: Record<OrderImportJobStatus, string> = {
  [OrderImportJobStatusEnum.PENDING]: '正在排队',
  [OrderImportJobStatusEnum.PROCESSING]: '正在处理',
  [OrderImportJobStatusEnum.COMPLETED]: '已完成',
  [OrderImportJobStatusEnum.FAILED]: '已失败',
};

export function describeImportJobStatus(status: OrderImportJobStatus): string {
  return IMPORT_JOB_STATUS_TEXT[status] ?? '正在处理';
}

export function asTemplateFields(value: Prisma.JsonValue): OrderImportTemplateField[] {
  const fields = Array.isArray(value) ? (value as unknown as OrderImportTemplateField[]) : [];
  return fields.map((field) => ({
    ...field,
    type: field.type ?? 'list',
    isValueRequired: resolveDefaultTemplateFieldValueRequired(field),
  }));
}

export function toTemplate(template: {
  id: bigint;
  name: string;
  isDefault: boolean;
  updatedAt: Date;
  defaultFields: Prisma.JsonValue;
  customerFields: Prisma.JsonValue;
}): OrderImportTemplate {
  return {
    id: String(template.id),
    name: template.name,
    isDefault: template.isDefault,
    updatedAt: template.updatedAt.toISOString(),
    defaultFields: asTemplateFields(template.defaultFields),
    customerFields: asTemplateFields(template.customerFields),
  };
}

export function toTemplateMutationResponse(template: {
  id: bigint;
  name: string;
  isDefault: boolean;
  updatedAt: Date;
  customerFields: Prisma.JsonValue;
}): OrderImportTemplateMutationResponse {
  return {
    id: String(template.id),
    name: template.name,
    isDefault: template.isDefault,
    updatedAt: template.updatedAt.toISOString(),
    customerFields: asTemplateFields(template.customerFields),
  };
}

export function asJobFailures(value: Prisma.JsonValue | null): OrderImportJobFailure[] {
  return Array.isArray(value) ? (value as unknown as OrderImportJobFailure[]) : [];
}

export function asConflictDetails(value: Prisma.JsonValue | null): OrderImportJobConflictDetail[] {
  return Array.isArray(value) ? (value as unknown as OrderImportJobConflictDetail[]) : [];
}

export function readString(value: unknown): string | undefined {
  return normalizeOptionalText(value);
}

export function readDate(value: unknown): Date | undefined {
  const resolved = readString(value);
  if (!resolved) {
    return undefined;
  }
  const date = new Date(resolved);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function readMoney(value: unknown): Decimal | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  return new Decimal(numeric).toDecimalPlaces(2);
}

export function readPayType(value: unknown): OrderPayType | undefined {
  const resolved = readString(value)?.toLowerCase();
  if (!resolved) {
    return undefined;
  }

  if (['credit', '账期'].includes(resolved)) {
    return OrderPayTypeEnum.CREDIT;
  }

  if (['cash', '现款', '现金'].includes(resolved)) {
    return OrderPayTypeEnum.CASH;
  }

  return undefined;
}

const PRISMA_TO_IMPORT_JOB_STATUS: Record<PrismaImportJobStatusEnum, OrderImportJobStatus> = {
  [PrismaImportJobStatusEnum.PENDING]: OrderImportJobStatusEnum.PENDING,
  [PrismaImportJobStatusEnum.PROCESSING]: OrderImportJobStatusEnum.PROCESSING,
  [PrismaImportJobStatusEnum.COMPLETED]: OrderImportJobStatusEnum.COMPLETED,
  [PrismaImportJobStatusEnum.FAILED]: OrderImportJobStatusEnum.FAILED,
};

const IMPORT_JOB_STATUS_TO_PRISMA: Record<OrderImportJobStatus, PrismaImportJobStatusEnum> = {
  [OrderImportJobStatusEnum.PENDING]: PrismaImportJobStatusEnum.PENDING,
  [OrderImportJobStatusEnum.PROCESSING]: PrismaImportJobStatusEnum.PROCESSING,
  [OrderImportJobStatusEnum.COMPLETED]: PrismaImportJobStatusEnum.COMPLETED,
  [OrderImportJobStatusEnum.FAILED]: PrismaImportJobStatusEnum.FAILED,
};

const PRISMA_TO_ORDER_STATUS: Record<PrismaOrderStatusEnum, OrderStatus> = {
  [PrismaOrderStatusEnum.PENDING]: OrderStatusEnum.PENDING,
  [PrismaOrderStatusEnum.PARTIAL]: OrderStatusEnum.PARTIAL,
  [PrismaOrderStatusEnum.PAID]: OrderStatusEnum.PAID,
  [PrismaOrderStatusEnum.EXPIRED]: OrderStatusEnum.EXPIRED,
  [PrismaOrderStatusEnum.CREDIT]: OrderStatusEnum.CREDIT,
};

const IMPORT_CONFLICT_POLICY_TO_PRISMA: Record<
  (typeof OrderImportConflictPolicyEnum)[keyof typeof OrderImportConflictPolicyEnum],
  PrismaImportConflictPolicyEnum
> = {
  [OrderImportConflictPolicyEnum.SKIP]: PrismaImportConflictPolicyEnum.SKIP,
  [OrderImportConflictPolicyEnum.OVERWRITE]: PrismaImportConflictPolicyEnum.OVERWRITE,
};

const PRISMA_TO_IMPORT_CONFLICT_POLICY: Record<
  PrismaImportConflictPolicyEnum,
  (typeof OrderImportConflictPolicyEnum)[keyof typeof OrderImportConflictPolicyEnum]
> = {
  [PrismaImportConflictPolicyEnum.SKIP]: OrderImportConflictPolicyEnum.SKIP,
  [PrismaImportConflictPolicyEnum.OVERWRITE]: OrderImportConflictPolicyEnum.OVERWRITE,
};

const ORDER_PAY_TYPE_TO_PRISMA: Record<OrderPayType, PrismaOrderPayTypeEnum> = {
  [OrderPayTypeEnum.CASH]: PrismaOrderPayTypeEnum.CASH,
  [OrderPayTypeEnum.CREDIT]: PrismaOrderPayTypeEnum.CREDIT,
};

export function toImportJobStatus(status: PrismaImportJobStatusEnum): OrderImportJobStatus {
  return PRISMA_TO_IMPORT_JOB_STATUS[status] ?? OrderImportJobStatusEnum.PENDING;
}

export function toPrismaImportJobStatus(status: OrderImportJobStatus): PrismaImportJobStatusEnum {
  return IMPORT_JOB_STATUS_TO_PRISMA[status] ?? PrismaImportJobStatusEnum.PENDING;
}

export function toPrismaImportConflictPolicy(
  conflictPolicy: (typeof OrderImportConflictPolicyEnum)[keyof typeof OrderImportConflictPolicyEnum],
): PrismaImportConflictPolicyEnum {
  return IMPORT_CONFLICT_POLICY_TO_PRISMA[conflictPolicy] ?? PrismaImportConflictPolicyEnum.SKIP;
}

export function toImportConflictPolicy(
  conflictPolicy: PrismaImportConflictPolicyEnum,
): (typeof OrderImportConflictPolicyEnum)[keyof typeof OrderImportConflictPolicyEnum] {
  return PRISMA_TO_IMPORT_CONFLICT_POLICY[conflictPolicy] ?? OrderImportConflictPolicyEnum.SKIP;
}

export function fromPrismaOrderStatus(status: PrismaOrderStatusEnum): OrderStatus {
  return PRISMA_TO_ORDER_STATUS[status] ?? OrderStatusEnum.PENDING;
}

export function toPrismaOrderPayType(payType: OrderPayType): PrismaOrderPayTypeEnum {
  return ORDER_PAY_TYPE_TO_PRISMA[payType] ?? PrismaOrderPayTypeEnum.CASH;
}
