import { Prisma } from '@prisma/client';
import dayjs from 'dayjs';
import type { OrderPrintRecordsQuery, TenantPrintRecordsQuery } from '@shou/types/contracts';
import { toPrismaPrintRecordResult } from './mapping/order-enum.mapper';

export function buildOrderPrintWhere(tenantId: string, orderId: string, query: OrderPrintRecordsQuery): Prisma.OrderPrintRecordWhereInput {
  const where: Prisma.OrderPrintRecordWhereInput = {
    tenantId,
    orderId,
  };

  if (query.result) {
    where.result = toPrismaPrintRecordResult(query.result);
  }

  const printedAt = buildPrintedAtFilter(query.dateFrom, query.dateTo);
  if (printedAt) {
    where.printedAt = printedAt;
  }

  return where;
}

export function buildTenantPrintWhere(tenantId: string, query: TenantPrintRecordsQuery, includeResult: boolean): Prisma.OrderPrintRecordWhereInput {
  const where: Prisma.OrderPrintRecordWhereInput = {
    tenantId,
  };

  if (includeResult && query.result) {
    where.result = toPrismaPrintRecordResult(query.result);
  }

  const printedAt = buildPrintedAtFilter(query.dateFrom, query.dateTo);
  if (printedAt) {
    where.printedAt = printedAt;
  }

  if (query.operatorId?.trim()) {
    where.operatorId = query.operatorId.trim();
  }

  if (query.orderId?.trim()) {
    where.orderId = query.orderId.trim();
  }

  if (query.keyword?.trim()) {
    const keyword = query.keyword.trim();
    where.OR = [
      {
        order: {
          sourceOrderNo: { contains: keyword, mode: 'insensitive' },
        },
      },
      {
        order: {
          customer: { contains: keyword, mode: 'insensitive' },
        },
      },
    ] as Prisma.OrderPrintRecordWhereInput[];
  }

  return where;
}

export function buildPrintedAtFilter(dateFrom?: string, dateTo?: string): Prisma.DateTimeFilter | undefined {
  if (!dateFrom && !dateTo) {
    return undefined;
  }

  const printedAt: Prisma.DateTimeFilter = {};
  if (dateFrom) {
    printedAt.gte = dayjs(dateFrom).startOf('day').toDate();
  }
  if (dateTo) {
    printedAt.lte = dayjs(dateTo).endOf('day').toDate();
  }

  return printedAt;
}
