import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethodEnum as PrismaPaymentMethodEnum } from '@prisma/client';
import type { PaginatedResponse } from '@shou/types/common';
import type { TenantOrderItem, TenantOrderListItem } from '@shou/types/contracts';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { formatDateTime, normalizePage, normalizePageSize } from '../common/validators';
import { PaymentWindowService } from '../payment/payment-window.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { toTenantOrder, toTenantOrderListItem } from './mapping/order.mapper';
import { buildOrderListWhere } from './order.query';
import { getOrderTenantId } from './order.shared';

@Injectable()
export class OrderTenantQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentWindowService: PaymentWindowService,
  ) {}

  private readonly latestOfflinePaymentOrderInclude = {
    where: {
      offlineSubmittedAt: { not: null },
      paymentMethod: { in: [PrismaPaymentMethodEnum.CASH, PrismaPaymentMethodEnum.OTHER_PAID] },
    },
    orderBy: [{ offlineSubmittedAt: 'desc' as const }, { createdAt: 'desc' as const }],
    take: 1,
  };

  // 获取租户侧订单列表，自动注入 tenantId 过滤
  async findAll(currentUser: JwtPayload, query: ListOrdersQueryDto): Promise<PaginatedResponse<TenantOrderListItem>> {
    const tenantId = getOrderTenantId(currentUser);
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize);
    const qrCodeExpiryDays = await this.paymentWindowService.getTenantQrCodeExpiryDays(tenantId);
    const where = buildOrderListWhere(tenantId, query, [{ tenantId, qrCodeExpiryDays }]);

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { paymentOrders: this.latestOfflinePaymentOrderInclude },
        orderBy: [{ orderTime: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      list: orders.map((order) => ({
        ...toTenantOrderListItem(order),
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
      include: { lineItems: true, paymentOrders: this.latestOfflinePaymentOrderInclude },
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
