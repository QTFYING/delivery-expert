import { Injectable, NotFoundException } from '@nestjs/common';
import type { PaginatedResponse } from '@shou/types/common';
import type { TenantOrderItem } from '@shou/types/contracts';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { formatDateTime, normalizePage, normalizePageSize } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { toTenantOrder } from './mapping/order.mapper';
import { buildOrderListWhere } from './order.query';
import { getOrderTenantId } from './order.shared';

@Injectable()
export class OrderTenantQueryService {
  constructor(private readonly prisma: PrismaService) {}

  // 获取租户侧订单列表，自动注入 tenantId 过滤
  async findAll(currentUser: JwtPayload, query: ListOrdersQueryDto): Promise<PaginatedResponse<TenantOrderItem>> {
    const tenantId = getOrderTenantId(currentUser);
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize);
    const where = buildOrderListWhere(tenantId, query);

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { lineItems: true },
        orderBy: [{ orderTime: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      list: orders.map((order) => ({
        ...toTenantOrder(order),
        lastPrintedAt: formatDateTime(order.lastPrintedAt),
        lastFailedAt: formatDateTime(order.lastFailedAt),
        orderTime: formatDateTime(order.orderTime),
        voidedAt: formatDateTime(order.voidedAt),
      })),
      total,
      page,
      pageSize,
    };
  }

  // 获取租户侧订单详情，仅返回当前 tenantId 下的订单
  async getOrder(currentUser: JwtPayload, orderId: string): Promise<TenantOrderItem> {
    const tenantId = getOrderTenantId(currentUser);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId, deletedAt: null },
      include: { lineItems: true },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    return {
      ...toTenantOrder(order),
      lastPrintedAt: formatDateTime(order.lastPrintedAt),
      lastFailedAt: formatDateTime(order.lastFailedAt),
      orderTime: formatDateTime(order.orderTime),
      voidedAt: formatDateTime(order.voidedAt),
    };
  }
}
