import { Injectable } from '@nestjs/common';
import type { PaginatedResponse } from '@shou/types/common';
import type { PrintingOrderListItem, PrintingOrderListQuery } from '@shou/types/contracts';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { normalizePage, normalizePageSize } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import { getOrderTenantId } from './order.shared';
import { buildPrintingOrderWhere } from './printing-order.query';

@Injectable()
export class PrintingOrderQueryService {
  constructor(private readonly prisma: PrismaService) {}

  // 获取打印中心轻量订单列表，按当前租户限定可打印订单池
  async findPrintingOrders(currentUser: JwtPayload, query: PrintingOrderListQuery): Promise<PaginatedResponse<PrintingOrderListItem>> {
    const tenantId = getOrderTenantId(currentUser);
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize);
    const where = buildPrintingOrderWhere(tenantId, query);

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: {
          id: true,
          customer: true,
          prints: true,
          mappingTemplateId: true,
        },
        orderBy: [{ id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      list: orders.map((order) => ({
        id: order.id,
        customer: order.customer,
        prints: order.prints,
        mappingTemplateId: order.mappingTemplateId != null ? String(order.mappingTemplateId) : undefined,
      })),
      total,
      page,
      pageSize,
    };
  }
}
