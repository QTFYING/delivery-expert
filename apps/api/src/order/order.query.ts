import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrderPayTypeEnum } from '@shou/types/enums';
import dayjs from 'dayjs';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { toPrismaOrderCreditType, toPrismaOrderPayType } from './mapping/order-enum.mapper';
import { buildOrderSearchStatusWhere, type TenantPaymentWindowRule } from './order-status.query';

export function buildOrderListWhere(
  tenantId: string,
  query: ListOrdersQueryDto,
  tenantPaymentWindows: TenantPaymentWindowRule[] = [],
): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    tenantId,
    deletedAt: null,
  };

  applyOrderListFilters(where, query, tenantPaymentWindows);
  applyOrderKeywordFilter(where, query.keyword, false);

  return where;
}

export function buildOSOrderListWhere(query: ListOrdersQueryDto, tenantPaymentWindows: TenantPaymentWindowRule[] = []): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    deletedAt: null,
  };

  applyOrderListFilters(where, query, tenantPaymentWindows);
  applyOrderKeywordFilter(where, query.keyword, true);

  return where;
}

function applyOrderListFilters(where: Prisma.OrderWhereInput, query: ListOrdersQueryDto, tenantPaymentWindows: TenantPaymentWindowRule[]): void {
  if (query.status) {
    const statusWhere = buildOrderSearchStatusWhere(query.status, { tenantPaymentWindows });
    if (statusWhere) {
      appendAndFilter(where, statusWhere);
    }
  }
  if (query.payType) {
    where.payType = toPrismaOrderPayType(query.payType);
  }
  if (query.creditType) {
    if (query.payType === OrderPayTypeEnum.CASH) {
      throw new BadRequestException('payType=cash 时不能同时按 creditType 筛选');
    }
    where.payType = toPrismaOrderPayType(OrderPayTypeEnum.CREDIT);
    where.creditType = toPrismaOrderCreditType(query.creditType);
  }
  if (query.mappingTemplateId) {
    where.mappingTemplateId = BigInt(query.mappingTemplateId);
  }
  if (query.dateFrom || query.dateTo) {
    where.orderTime = {};
    if (query.dateFrom) {
      where.orderTime.gte = dayjs(query.dateFrom).startOf('day').toDate();
    }
    if (query.dateTo) {
      where.orderTime.lte = dayjs(query.dateTo).endOf('day').toDate();
    }
  }
}

function appendAndFilter(where: Prisma.OrderWhereInput, filter: Prisma.OrderWhereInput): void {
  const current = where.AND;
  const filters = Array.isArray(current) ? current : current ? [current] : [];
  where.AND = [...filters, filter];
}

function applyOrderKeywordFilter(where: Prisma.OrderWhereInput, rawKeyword: string | undefined, includeTenantName: boolean): void {
  const keyword = rawKeyword?.trim();
  if (!keyword) {
    return;
  }

  const filters: Prisma.OrderWhereInput[] = [
    { id: { contains: keyword, mode: 'insensitive' } },
    { sourceOrderNo: { contains: keyword, mode: 'insensitive' } },
    { groupKey: { contains: keyword, mode: 'insensitive' } },
    { customer: { contains: keyword, mode: 'insensitive' } },
    { customerPhone: { contains: keyword, mode: 'insensitive' } },
    { customerAddress: { contains: keyword, mode: 'insensitive' } },
  ];

  if (includeTenantName) {
    filters.push({ tenant: { name: { contains: keyword, mode: 'insensitive' } } });
  }

  where.OR = filters;
}
