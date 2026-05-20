import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, OrderStatusEnum as PrismaOrderStatusEnum } from '@prisma/client';
import type { PaginatedResponse } from '@shou/types/common';
import type {
  AdminReconciliationDailyRecordItem,
  AdminReconciliationSummaryResponse,
  FinanceReconciliationRecordItem,
  FinanceSummaryResponse,
} from '@shou/types/contracts';
import { AdminReconciliationStatusEnum, FinanceReconciliationStatusEnum, OrderStatusEnum, type OrderStatus } from '@shou/types/enums';
import dayjs from 'dayjs';
import Decimal from 'decimal.js';
import { JwtPayload } from '../auth/decorators/current-user.decorator';
import { formatDateTime } from '../common/validators';
import { fromPrismaOrderStatus } from '../order/mapping/order-enum.mapper';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getTenantSummary(currentUser: JwtPayload): Promise<FinanceSummaryResponse> {
    const tenantId = this.getTenantId(currentUser);
    const [orderAggregate, paymentAggregate, creditOrderCount] = await Promise.all([
      this.prisma.order.aggregate({
        where: { tenantId, deletedAt: null, voided: false },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      this.prisma.payment.aggregate({
        where: { tenantId },
        _sum: { amount: true, fee: true, net: true },
      }),
      this.prisma.order.count({
        where: { tenantId, deletedAt: null, voided: false, status: PrismaOrderStatusEnum.CREDIT },
      }),
    ]);

    const totalReceivable = this.money(orderAggregate._sum.totalAmount ?? 0);
    const totalReceived = this.money(paymentAggregate._sum.amount ?? 0);
    const totalFee = this.money(paymentAggregate._sum.fee ?? 0);
    const totalNet = this.money(paymentAggregate._sum.net ?? 0);

    return {
      totalReceivable,
      totalReceived,
      totalFee,
      totalNet,
      collectionRate: totalReceivable > 0 ? Number(new Decimal(totalReceived).div(totalReceivable).mul(100).toFixed(2)) : 0,
      creditOrderCount,
      orderCount: orderAggregate._count._all,
    };
  }

  async getTenantReconciliation(
    currentUser: JwtPayload,
    page?: number,
    pageSize?: number,
  ): Promise<PaginatedResponse<FinanceReconciliationRecordItem>> {
    const tenantId = this.getTenantId(currentUser);
    const resolvedPage = this.normalizePage(page);
    const resolvedPageSize = this.normalizePageSize(pageSize);
    const where: Prisma.PaymentWhereInput = { tenantId };

    const [records, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: { order: true },
        orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
        skip: (resolvedPage - 1) * resolvedPageSize,
        take: resolvedPageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      list: records.map((item) => ({
        orderId: item.orderId,
        customer: item.customer,
        amount: this.money(item.order.totalAmount),
        net: this.money(item.net),
        fee: this.money(item.fee),
        channel: item.channel,
        paidAt: formatDateTime(item.paidAt),
        status: this.toTenantReconciliationStatus(item.status),
      })),
      total,
      page: resolvedPage,
      pageSize: resolvedPageSize,
    };
  }

  async exportTenantReconciliation(currentUser: JwtPayload): Promise<{ fileName: string; content: string }> {
    const result = await this.getTenantReconciliation(currentUser, 1, 5000);
    return {
      fileName: `tenant-reconciliation-${dayjs().format('YYYYMMDDHHmmss')}.csv`,
      content: this.buildCsv(
        ['orderId', 'customer', 'amount', 'net', 'fee', 'channel', 'paidAt', 'status'],
        result.list.map((item) => [item.orderId, item.customer, item.amount, item.net, item.fee, item.channel, item.paidAt, item.status]),
      ),
    };
  }

  async getAdminSummary(): Promise<AdminReconciliationSummaryResponse> {
    const monthStart = dayjs().startOf('month').toDate();
    const monthEnd = dayjs().endOf('month').toDate();

    const [orders, payments] = await Promise.all([
      this.prisma.order.findMany({
        where: { deletedAt: null, voided: false, orderTime: { gte: monthStart, lte: monthEnd } },
        select: { totalAmount: true, paid: true, status: true },
      }),
      this.prisma.payment.findMany({
        where: { paidAt: { gte: monthStart, lte: monthEnd } },
        select: { amount: true },
      }),
    ]);

    const totalReceivable = orders.reduce((sum, item) => sum.plus(item.totalAmount.toString()), new Decimal(0));
    const totalReceived = payments.reduce((sum, item) => sum.plus(item.amount.toString()), new Decimal(0));
    const totalPending = orders.reduce(
      (sum, item) => sum.plus(Decimal.max(new Decimal(item.totalAmount.toString()).minus(item.paid.toString()), 0)),
      new Decimal(0),
    );
    const totalOverdue = orders
      .filter((item) => fromPrismaOrderStatus(item.status) === OrderStatusEnum.EXPIRED)
      .reduce((sum, item) => sum.plus(Decimal.max(new Decimal(item.totalAmount.toString()).minus(item.paid.toString()), 0)), new Decimal(0));

    return {
      totalReceivable: Number(totalReceivable.toFixed(2)),
      totalReceived: Number(totalReceived.toFixed(2)),
      totalPending: Number(totalPending.toFixed(2)),
      totalOverdue: Number(totalOverdue.toFixed(2)),
      progressPercent: totalReceivable.gt(0) ? Number(totalReceived.div(totalReceivable).mul(100).toFixed(2)) : 0,
    };
  }

  async getAdminDaily(page?: number, pageSize?: number): Promise<PaginatedResponse<AdminReconciliationDailyRecordItem>> {
    const resolvedPage = this.normalizePage(page);
    const resolvedPageSize = this.normalizePageSize(pageSize);
    const orders = await this.prisma.order.findMany({
      where: { deletedAt: null, voided: false },
      include: { tenant: true },
      orderBy: [{ orderTime: 'desc' }],
    });

    const grouped = new Map<string, AdminReconciliationDailyRecordItem>();
    for (const order of orders) {
      const date = dayjs(order.orderTime).format('YYYY-MM-DD');
      const tenantName = order.tenant.name;
      const key = `${date}:${tenantName}`;
      const amount = new Decimal(order.totalAmount.toString());
      const paid = new Decimal(order.paid.toString());
      const pending = Decimal.max(amount.minus(paid), 0);
      const current = grouped.get(key) ?? {
        date,
        tenant: tenantName,
        orders: 0,
        amount: 0,
        received: 0,
        pending: 0,
        status: AdminReconciliationStatusEnum.RECONCILING,
      };

      current.orders += 1;
      current.amount = Number(new Decimal(current.amount).plus(amount).toFixed(2));
      current.received = Number(new Decimal(current.received).plus(paid).toFixed(2));
      current.pending = Number(new Decimal(current.pending).plus(pending).toFixed(2));
      current.status = this.resolveAdminReconciliationStatus(current.status, fromPrismaOrderStatus(order.status), current.pending, current.received);
      grouped.set(key, current);
    }

    const list = Array.from(grouped.values()).sort((a, b) => `${b.date}${b.tenant}`.localeCompare(`${a.date}${a.tenant}`));

    return {
      list: list.slice((resolvedPage - 1) * resolvedPageSize, resolvedPage * resolvedPageSize),
      total: list.length,
      page: resolvedPage,
      pageSize: resolvedPageSize,
    };
  }

  async exportAdminReconciliation(): Promise<{ fileName: string; content: string }> {
    const result = await this.getAdminDaily(1, 5000);
    return {
      fileName: `admin-reconciliation-${dayjs().format('YYYYMMDDHHmmss')}.csv`,
      content: this.buildCsv(
        ['date', 'tenant', 'orders', 'amount', 'received', 'pending', 'status'],
        result.list.map((item) => [item.date, item.tenant, item.orders, item.amount, item.received, item.pending, item.status]),
      ),
    };
  }

  private resolveAdminReconciliationStatus(
    currentStatus: (typeof AdminReconciliationStatusEnum)[keyof typeof AdminReconciliationStatusEnum],
    orderStatus: OrderStatus,
    pending: number,
    received: number,
  ): (typeof AdminReconciliationStatusEnum)[keyof typeof AdminReconciliationStatusEnum] {
    if (currentStatus === AdminReconciliationStatusEnum.OVERDUE_UNPAID) {
      return currentStatus;
    }
    if (orderStatus === OrderStatusEnum.EXPIRED && pending > 0) {
      return AdminReconciliationStatusEnum.OVERDUE_UNPAID;
    }
    if (pending === 0) {
      return AdminReconciliationStatusEnum.VERIFIED;
    }
    if (received > 0) {
      return AdminReconciliationStatusEnum.PARTIAL_UNVERIFIED;
    }
    return AdminReconciliationStatusEnum.RECONCILING;
  }

  private toTenantReconciliationStatus(status: string): (typeof FinanceReconciliationStatusEnum)[keyof typeof FinanceReconciliationStatusEnum] {
    if (status === 'SUCCESS') {
      return FinanceReconciliationStatusEnum.VERIFIED;
    }
    if (status === 'PENDING') {
      return FinanceReconciliationStatusEnum.PENDING;
    }
    return FinanceReconciliationStatusEnum.EXCEPTION;
  }

  private buildCsv(headers: Array<string>, rows: Array<Array<string | number>>): string {
    const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    return [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n');
  }

  private money(value: Prisma.Decimal | number): number {
    return Number(new Decimal(value.toString()).toFixed(2));
  }

  private normalizePage(value?: number): number {
    return value && value > 0 ? value : 1;
  }

  private normalizePageSize(value?: number): number {
    if (!value || value <= 0) return 20;
    return Math.min(value, 5000);
  }

  private getTenantId(currentUser: JwtPayload): string {
    if (!currentUser.tenantId) {
      throw new BadRequestException('当前登录态不属于租户侧');
    }
    return currentUser.tenantId;
  }
}
