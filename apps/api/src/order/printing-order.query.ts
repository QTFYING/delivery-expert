import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrintingOrderListQuery } from '@shou/types/contracts';
import { PrintingOrderPrintStatusEnum } from '@shou/types/enums';
import dayjs from 'dayjs';

export function buildPrintingOrderWhere(tenantId: string, query: PrintingOrderListQuery): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    tenantId,
    deletedAt: null,
    voided: false,
  };

  applyPrintingOrderDateFilter(where, query);
  applyPrintingOrderPrintStatusFilter(where, query.printStatus);
  applyPrintingOrderKeywordFilter(where, query.keyword);

  return where;
}

function applyPrintingOrderDateFilter(where: Prisma.OrderWhereInput, query: PrintingOrderListQuery): void {
  if (query.date && (query.dateFrom || query.dateTo)) {
    throw new BadRequestException('date 不能与 dateFrom/dateTo 同时传入');
  }

  const dateFrom = query.date ?? query.dateFrom;
  const dateTo = query.date ?? query.dateTo;
  if (!dateFrom && !dateTo) {
    return;
  }

  const start = dateFrom ? dayjs(dateFrom).startOf('day') : undefined;
  const end = dateTo ? dayjs(dateTo).endOf('day') : undefined;
  if (start && end && start.isAfter(end)) {
    throw new BadRequestException('dateFrom 不能晚于 dateTo');
  }

  where.createdAt = {
    ...(start ? { gte: start.toDate() } : {}),
    ...(end ? { lte: end.toDate() } : {}),
  };
}

function applyPrintingOrderPrintStatusFilter(where: Prisma.OrderWhereInput, printStatus?: string): void {
  if (!printStatus || printStatus === PrintingOrderPrintStatusEnum.ALL) {
    return;
  }

  if (printStatus === PrintingOrderPrintStatusEnum.UNPRINTED) {
    where.prints = 0;
    return;
  }

  if (printStatus === PrintingOrderPrintStatusEnum.PRINTED) {
    where.prints = { gt: 0 };
  }
}

function applyPrintingOrderKeywordFilter(where: Prisma.OrderWhereInput, rawKeyword?: string): void {
  const keyword = rawKeyword?.trim();
  if (!keyword) {
    return;
  }

  where.OR = [
    { id: { contains: keyword, mode: 'insensitive' } },
    { customer: { contains: keyword, mode: 'insensitive' } },
  ];
}
