import { BadRequestException, Injectable } from '@nestjs/common';
import type { AnalyticsDashboardResponse, DailyTrendItem, LiveFeedEntryItem, MonthlyTrendItem } from '@shou/types/contracts';
import { OrderPayTypeEnum as PrismaOrderPayTypeEnum, OrderStatusEnum as PrismaOrderStatusEnum } from '@prisma/client';
import { PaymentRecordStatusEnum, UserRoleEnum, type PaymentRecordStatus, type UserRole } from '@shou/types/enums';
import Decimal from 'decimal.js';
import dayjs from 'dayjs';
import { JwtPayload } from '../auth/decorators/current-user.decorator';
import { fromPrismaPaymentRecordStatus } from '../payment/mapping/payment.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantCreditRemindDays } from '../order/order-settings.query';

const LIVE_PAYMENT_STATUS: Record<PaymentRecordStatus, string> = {
  [PaymentRecordStatusEnum.SUCCESS]: 'paid',
  [PaymentRecordStatusEnum.PARTIAL]: 'partial',
  [PaymentRecordStatusEnum.PENDING]: 'pending',
  [PaymentRecordStatusEnum.FAILED]: 'pending',
};

const ROLE_TITLE: Record<UserRole, string> = {
  [UserRoleEnum.OS_SUPER_ADMIN]: '今日收款总览',
  [UserRoleEnum.TENANT_OWNER]: '今日收款总览',
  [UserRoleEnum.TENANT_OPERATOR]: '今日打单任务',
  [UserRoleEnum.TENANT_FINANCE]: '财务对账中心',
  [UserRoleEnum.TENANT_VIEWER]: '审计只读视图',
};

@Injectable()
export class ReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getDailyTrend(currentUser: JwtPayload): Promise<DailyTrendItem[]> {
    const tenantId = this.getTenantId(currentUser);
    const start = dayjs().subtract(6, 'day').startOf('day');
    const end = dayjs().endOf('day');

    const [orders, payments] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          tenantId,
          deletedAt: null,
          orderTime: { gte: start.toDate(), lte: end.toDate() },
        },
        select: { orderTime: true, totalAmount: true },
      }),
      this.prisma.payment.findMany({
        where: {
          tenantId,
          paidAt: { gte: start.toDate(), lte: end.toDate() },
        },
        select: { paidAt: true, amount: true },
      }),
    ]);

    return Array.from({ length: 7 }, (_, index) => {
      const current = start.add(index, 'day');
      const receivableAmount = orders
        .filter((item) => dayjs(item.orderTime).isSame(current, 'day'))
        .reduce((sum, item) => sum.plus(item.totalAmount.toString()), new Decimal(0));
      const receivedAmount = payments
        .filter((item) => dayjs(item.paidAt).isSame(current, 'day'))
        .reduce((sum, item) => sum.plus(item.amount.toString()), new Decimal(0));

      return {
        day: current.format('MM-DD'),
        receivableAmount: Number(receivableAmount.toFixed(2)),
        receivedAmount: Number(receivedAmount.toFixed(2)),
      };
    });
  }

  async getMonthlyTrend(currentUser: JwtPayload, months?: number): Promise<MonthlyTrendItem[]> {
    const tenantId = this.getTenantId(currentUser);
    const monthCount = months && months > 0 ? Math.min(months, 12) : 6;
    const start = dayjs()
      .startOf('month')
      .subtract(monthCount - 1, 'month');
    const end = dayjs().endOf('month');

    const [orders, payments] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          tenantId,
          deletedAt: null,
          orderTime: { gte: start.toDate(), lte: end.toDate() },
        },
        select: { orderTime: true, totalAmount: true },
      }),
      this.prisma.payment.findMany({
        where: {
          tenantId,
          paidAt: { gte: start.toDate(), lte: end.toDate() },
        },
        select: { paidAt: true, amount: true },
      }),
    ]);

    return Array.from({ length: monthCount }, (_, index) => {
      const current = start.add(index, 'month');
      const receivableAmount = orders
        .filter((item) => dayjs(item.orderTime).isSame(current, 'month'))
        .reduce((sum, item) => sum.plus(item.totalAmount.toString()), new Decimal(0));
      const receivedAmount = payments
        .filter((item) => dayjs(item.paidAt).isSame(current, 'month'))
        .reduce((sum, item) => sum.plus(item.amount.toString()), new Decimal(0));

      return {
        month: current.format('M月'),
        receivableAmount: Number(receivableAmount.toFixed(2)),
        receivedAmount: Number(receivedAmount.toFixed(2)),
      };
    });
  }

  async getLivePayments(currentUser: JwtPayload): Promise<LiveFeedEntryItem[]> {
    const tenantId = this.getTenantId(currentUser);
    const start = dayjs().startOf('day').toDate();

    const payments = await this.prisma.payment.findMany({
      where: {
        tenantId,
        paidAt: { gte: start },
      },
      orderBy: { paidAt: 'desc' },
      take: 20,
      select: {
        paidAt: true,
        customer: true,
        amount: true,
        status: true,
      },
    });

    return payments.map((item) => ({
      time: dayjs(item.paidAt).format('HH:mm'),
      customer: item.customer,
      amount: Number(new Decimal(item.amount.toString()).toFixed(2)),
      status: this.toLiveStatus(fromPrismaPaymentRecordStatus(item.status)),
    }));
  }

  async getDashboard(currentUser: JwtPayload): Promise<AnalyticsDashboardResponse> {
    const tenantId = this.getTenantId(currentUser);
    const todayStart = dayjs().startOf('day');
    const todayEnd = dayjs().endOf('day');
    const remindDays = await getTenantCreditRemindDays(this.prisma, tenantId);
    const remindEnd = dayjs().add(remindDays, 'day').endOf('day');

    const [todayOrders, todayPayments, pendingPrintCount, creditDueSoonCount, partialPaymentCount] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          tenantId,
          deletedAt: null,
          orderTime: { gte: todayStart.toDate(), lte: todayEnd.toDate() },
        },
        select: { totalAmount: true },
      }),
      this.prisma.payment.findMany({
        where: {
          tenantId,
          paidAt: { gte: todayStart.toDate(), lte: todayEnd.toDate() },
        },
        select: { amount: true },
      }),
      this.prisma.order.count({
        where: {
          tenantId,
          deletedAt: null,
          voided: false,
          prints: 0,
          status: { in: [PrismaOrderStatusEnum.PENDING, PrismaOrderStatusEnum.PARTIAL] },
        },
      }),
      this.prisma.order.count({
        where: {
          tenantId,
          deletedAt: null,
          voided: false,
          payType: PrismaOrderPayTypeEnum.CREDIT,
          status: { not: PrismaOrderStatusEnum.PAID },
          creditDueDate: { gte: todayStart.toDate(), lte: remindEnd.toDate() },
        },
      }),
      this.prisma.order.count({
        where: {
          tenantId,
          deletedAt: null,
          voided: false,
          status: PrismaOrderStatusEnum.PARTIAL,
        },
      }),
    ]);

    const todayReceivable = todayOrders.reduce((sum, item) => sum.plus(item.totalAmount.toString()), new Decimal(0));
    const todayReceived = todayPayments.reduce((sum, item) => sum.plus(item.amount.toString()), new Decimal(0));
    const todayPending = Decimal.max(todayReceivable.minus(todayReceived), 0);
    const collectionRate = todayReceivable.gt(0) ? Number(todayReceived.div(todayReceivable).mul(100).toFixed(2)) : 0;

    return {
      todayReceivable: Number(todayReceivable.toFixed(2)),
      todayReceived: Number(todayReceived.toFixed(2)),
      todayPending: Number(todayPending.toFixed(2)),
      collectionRate,
      pendingPrintCount,
      creditDueSoonCount,
      partialPaymentCount,
      roleTitle: this.resolveRoleTitle(currentUser.role),
    };
  }

  private toLiveStatus(status: PaymentRecordStatus): string {
    return LIVE_PAYMENT_STATUS[status] ?? 'pending';
  }

  private resolveRoleTitle(role: UserRole): string {
    return ROLE_TITLE[role] ?? ROLE_TITLE[UserRoleEnum.TENANT_OWNER];
  }

  private getTenantId(currentUser: JwtPayload): string {
    if (!currentUser.tenantId) {
      throw new BadRequestException('当前登录态不属于租户侧，无法读取分析数据');
    }
    return currentUser.tenantId;
  }
}
