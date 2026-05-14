import { Prisma } from '@prisma/client';
import dayjs from 'dayjs';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { toPrismaOrderPayType, toPrismaOrderStatus } from './mapping/order-enum.mapper';

export function buildOrderListWhere(tenantId: string, query: ListOrdersQueryDto): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    tenantId,
    deletedAt: null,
  };

  if (query.status) {
    where.status = toPrismaOrderStatus(query.status);
  }
  if (query.payType) {
    where.payType = toPrismaOrderPayType(query.payType);
  }
  if (query.templateId) {
    where.mappingTemplateId = BigInt(query.templateId);
  }
  if (query.keyword?.trim()) {
    const keyword = query.keyword.trim();
    where.OR = [
      { id: { contains: keyword, mode: 'insensitive' } },
      { sourceOrderNo: { contains: keyword, mode: 'insensitive' } },
      { groupKey: { contains: keyword, mode: 'insensitive' } },
      { customer: { contains: keyword, mode: 'insensitive' } },
      { customerPhone: { contains: keyword, mode: 'insensitive' } },
      { customerAddress: { contains: keyword, mode: 'insensitive' } },
    ] as unknown as Prisma.OrderWhereInput[];
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

  return where;
}
