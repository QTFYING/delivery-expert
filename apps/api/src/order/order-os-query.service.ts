import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PaginatedResponse } from '@shou/types/common';
import type { AdminOrderItem } from '@shou/types/contracts';
import { formatDateTime, normalizePage, normalizePageSize } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { toAdminOrder } from './mapping/order.mapper';

@Injectable()
export class OrderOSQueryService {
  constructor(private readonly prisma: PrismaService) {}

  // 获取 OS 侧订单列表，不注入租户作用域
  async findAll(query: ListOrdersQueryDto): Promise<PaginatedResponse<AdminOrderItem>> {
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize);
    const where = this.buildOSOrderListWhere(query);

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { lineItems: true, tenant: true },
        orderBy: [{ orderTime: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      list: orders.map((order) => ({
        ...toAdminOrder(order),
        orderTime: formatDateTime(order.orderTime),
        voidedAt: formatDateTime(order.voidedAt),
      })),
      total,
      page,
      pageSize,
    };
  }

  // 获取 OS 侧订单详情，允许跨租户读取但仍排除软删除数据
  async getOrder(orderId: string): Promise<AdminOrderItem> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: { lineItems: true, tenant: true },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    return {
      ...toAdminOrder(order),
      orderTime: formatDateTime(order.orderTime),
      voidedAt: formatDateTime(order.voidedAt),
    };
  }

  // 组装 OS 侧订单列表查询条件，避免租户侧 where 构造混入平台视角
  private buildOSOrderListWhere(query: ListOrdersQueryDto): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
    };

    if (query.keyword?.trim()) {
      const keyword = query.keyword.trim();
      where.OR = [
        { id: keyword },
        { sourceOrderNo: { contains: keyword, mode: 'insensitive' } },
        { groupKey: { contains: keyword, mode: 'insensitive' } },
        { customer: { contains: keyword, mode: 'insensitive' } },
        { customerPhone: { contains: keyword, mode: 'insensitive' } },
        { customerAddress: { contains: keyword, mode: 'insensitive' } },
        { tenant: { name: { contains: keyword, mode: 'insensitive' } } },
      ] as unknown as Prisma.OrderWhereInput[];
    }

    return where;
  }
}
