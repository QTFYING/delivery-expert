import { Injectable, NotFoundException } from '@nestjs/common';
import type { PaginatedResponse } from '@shou/types/common';
import type { AdminOrderItem } from '@shou/types/contracts';
import { formatDateTime, normalizePage, normalizePageSize } from '../common/validators';
import { PaymentWindowService } from '../payment/payment-window.service';
import { PrismaService } from '../prisma/prisma.service';
import { GENERAL_SETTINGS_CONFIG_GROUP } from '../settings/settings.constants';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { toAdminOrder } from './mapping/order.mapper';
import { buildOSOrderListWhere } from './order.query';
import type { TenantPaymentWindowRule } from './order-status.query';

@Injectable()
export class OrderOSQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentWindowService: PaymentWindowService,
  ) {}

  // 获取 OS 侧订单列表，不注入租户作用域
  async findAll(query: ListOrdersQueryDto): Promise<PaginatedResponse<AdminOrderItem>> {
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize);
    const tenantPaymentWindows = await this.getTenantPaymentWindowRules();
    const where = buildOSOrderListWhere(query, tenantPaymentWindows);

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

  // 读取平台侧跨租户订单查询所需的租户支付有效期规则
  private async getTenantPaymentWindowRules(): Promise<TenantPaymentWindowRule[]> {
    const [tenants, platformDefault] = await Promise.all([
      this.prisma.tenant.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          generalSettings: { select: { qrCodeExpiry: true } },
        },
      }),
      this.prisma.systemConfig.findUnique({
        where: {
          group_key: {
            group: GENERAL_SETTINGS_CONFIG_GROUP,
            key: 'qrCodeExpiry',
          },
        },
        select: { value: true },
      }),
    ]);

    return tenants.map((tenant) => ({
      tenantId: tenant.id,
      qrCodeExpiryDays: this.paymentWindowService.resolveQrCodeExpiryDays({
        tenantOverrideDays: tenant.generalSettings?.qrCodeExpiry ?? null,
        platformDefaultValue: platformDefault?.value,
      }),
    }));
  }
}
