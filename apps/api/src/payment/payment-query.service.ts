import { Injectable } from '@nestjs/common';
import {
  type Prisma,
  CashVerifyStatusEnum as PrismaCashVerifyStatusEnum,
  OrderStatusEnum as PrismaOrderStatusEnum,
  PaymentChannelEnum as PrismaPaymentChannelEnum,
  PaymentMethodEnum as PrismaPaymentMethodEnum,
  PaymentOrderStatusEnum as PrismaPaymentOrderStatusEnum,
  PaymentRecordStatusEnum as PrismaPaymentRecordStatusEnum,
} from '@prisma/client';

import type { PaginatedResponse } from '@shou/types/common';
import type {
  AdminPaymentRecordItem,
  OfflinePaymentInfo,
  PaymentAction,
  PaymentListQuery,
  PaymentOrderDetailResponse,
  PaymentStatusResponse,
  PaymentSummaryResponse,
  TenantPaymentRecordItem,
} from '@shou/types/contracts';

import { OfflinePaymentMethodEnum, OrderStatusEnum, PaymentMethodEnum, PaymentOrderStatusEnum } from '@shou/types/enums';
import dayjs from 'dayjs';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { BusinessException } from '../common/exceptions/business.exception';
import { decimal, toDecimalNumber, toMoneyNumber } from '../common/money';
import { formatDateTime, normalizePage, normalizePageSize } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';

import {
  cashVerifyStatusText,
  fromPrismaCashVerifyStatus,
  fromPrismaPaymentMethod,
  fromPrismaPaymentRecordStatus,
  toPaymentDomainExpirableSnapshot,
  toPaymentDomainOrderSnapshot,
  toPaymentDomainStatusSnapshot,
  toPrismaPaymentOrderUpdateData,
} from './mapping/payment.mapper';

import { buildExpirePayingPaymentOrderTransition, resolvePaymentOrderStatus, shouldExpirePayingPaymentOrder } from './payment.domain';
import { PaymentTenantConfigService } from './payment-tenant-config.service';
import { PaymentWindowService } from './payment-window.service';
import { buildPaymentOrderSummary, getPaymentTenantId, isUuid } from './payment.shared';

@Injectable()
export class PaymentQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentTenantConfigService: PaymentTenantConfigService,
    private readonly paymentWindowService: PaymentWindowService,
  ) {}

  // 查询 H5 公开订单详情，并合成页面当前收款状态与支付动作
  async getPaymentDetail(token: string): Promise<PaymentOrderDetailResponse> {
    const order = await this.getPublicOrderByToken(token);
    if (order.voided) {
      throw new BusinessException(1002, '二维码路由已过期', 410);
    }

    const latestPaymentOrder = await this.getLatestPaymentOrder(order.id);
    const currentPaymentOrder = await this.expireIfNeeded(latestPaymentOrder);
    const resolvedStatus = resolvePaymentOrderStatus(
      toPaymentDomainOrderSnapshot(order),
      currentPaymentOrder ? toPaymentDomainStatusSnapshot(currentPaymentOrder) : null,
    );
    const activePaymentChannel = await this.paymentTenantConfigService.getActivePaymentChannelSnapshot({
      tenantId: order.tenantId,
      activePaymentChannel: order.tenant.activePaymentChannel,
    });
    const paymentWindowState = await this.applyPaymentWindowOverride({
      tenantId: order.tenantId,
      orderTime: order.orderTime,
      status: resolvedStatus,
      statusMessage: currentPaymentOrder?.statusMessage ?? undefined,
      paymentAction: this.buildPaymentAction(order, currentPaymentOrder, resolvedStatus, activePaymentChannel),
    });

    return {
      orderNo: order.id,
      merchant: order.tenant.name,
      customer: order.customer,
      amount: toMoneyNumber(order.totalAmount),
      paidAmount: toMoneyNumber(order.paid),
      summary: buildPaymentOrderSummary(order.lineItems),
      date: formatDateTime(order.orderTime),
      status: paymentWindowState.status,
      statusMessage: paymentWindowState.statusMessage,
      servicePhone: order.tenant.contactPhone,
      selectedPaymentMethod: currentPaymentOrder ? fromPrismaPaymentMethod(currentPaymentOrder.paymentMethod) : null,
      paymentAction: paymentWindowState.paymentAction,
      offlinePayment: this.toOfflinePaymentInfo(currentPaymentOrder),
      items: order.lineItems.map((item) => ({
        itemId: String(item.id),
        skuId: item.skuId,
        skuName: item.skuName,
        skuSpec: item.skuSpec ?? undefined,
        unit: item.unit,
        quantity: toDecimalNumber(item.quantity, 3),
        unitPrice: toMoneyNumber(item.unitPrice),
        lineAmount: toMoneyNumber(item.lineAmount),
      })),
    };
  }

  // 查询订单维度的 H5 收款状态，供前端轮询网关回调结果
  async getPaymentStatus(token: string): Promise<PaymentStatusResponse> {
    const order = await this.getPublicOrderByToken(token);
    if (order.voided) {
      throw new BusinessException(1002, '二维码路由已过期', 410);
    }

    const latestPaymentOrder = await this.getLatestPaymentOrder(order.id);
    const currentPaymentOrder = await this.expireIfNeeded(latestPaymentOrder);
    const resolvedStatus = resolvePaymentOrderStatus(
      toPaymentDomainOrderSnapshot(order),
      currentPaymentOrder ? toPaymentDomainStatusSnapshot(currentPaymentOrder) : null,
    );
    const activePaymentChannel = await this.paymentTenantConfigService.getActivePaymentChannelSnapshot({
      tenantId: order.tenantId,
      activePaymentChannel: order.tenant.activePaymentChannel,
    });
    const latestPayment =
      resolvedStatus === PaymentOrderStatusEnum.PAID
        ? await this.prisma.payment.findFirst({
            where: { orderId: order.id },
            orderBy: { paidAt: 'desc' },
          })
        : null;
    const paymentWindowState = await this.applyPaymentWindowOverride({
      tenantId: order.tenantId,
      orderTime: order.orderTime,
      status: resolvedStatus,
      statusMessage: currentPaymentOrder?.statusMessage ?? undefined,
      paymentAction: this.buildPaymentAction(order, currentPaymentOrder, resolvedStatus, activePaymentChannel),
    });

    return {
      orderNo: order.id,
      status: paymentWindowState.status,
      statusMessage: paymentWindowState.statusMessage,
      paidAmount: paymentWindowState.status === PaymentOrderStatusEnum.PAID ? toMoneyNumber(order.paid) : undefined,
      paidAt: formatDateTime(latestPayment?.paidAt ?? currentPaymentOrder?.paidAt),
      selectedPaymentMethod: currentPaymentOrder ? (fromPrismaPaymentMethod(currentPaymentOrder.paymentMethod) ?? undefined) : undefined,
      paymentAction: paymentWindowState.paymentAction,
    };
  }

  // 查询租户或平台视角的收款流水列表，按当前用户身份收口数据边界
  async getPayments(currentUser: JwtPayload, query: PaymentListQuery): Promise<PaginatedResponse<TenantPaymentRecordItem | AdminPaymentRecordItem>> {
    if (!currentUser.tenantId) {
      return this.getAdminPayments(query);
    }

    const tenantId = getPaymentTenantId(currentUser);
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize);
    const where: Prisma.PaymentWhereInput = { tenantId };

    if (query.keyword?.trim()) {
      const keyword = query.keyword.trim();
      const orConditions: Prisma.PaymentWhereInput[] = [{ customer: { contains: keyword, mode: 'insensitive' } }];
      if (isUuid(keyword)) {
        orConditions.push({ orderId: keyword });
      }
      where.OR = orConditions;
    }
    if (query.channel?.trim()) {
      where.channel = query.channel.trim();
    }

    const [records, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      list: records.map((item) => ({
        id: item.id,
        orderId: item.orderId,
        customer: item.customer,
        amount: toMoneyNumber(item.amount),
        channel: item.channel,
        fee: toMoneyNumber(item.fee),
        net: toMoneyNumber(item.net),
        status: fromPrismaPaymentRecordStatus(item.status),
        paidAt: formatDateTime(item.paidAt),
      })),
      total,
      page,
      pageSize,
    };
  }

  // 查询当前用户视角下的收款汇总，租户侧只统计当前租户
  async getPaymentSummary(currentUser: JwtPayload): Promise<PaymentSummaryResponse> {
    if (!currentUser.tenantId) {
      return this.getAdminPaymentSummary();
    }

    const tenantId = getPaymentTenantId(currentUser);
    const start = dayjs().startOf('day').toDate();
    const end = dayjs().endOf('day').toDate();
    const where: Prisma.PaymentWhereInput = {
      tenantId,
      paidAt: { gte: start, lte: end },
    };

    const [aggregate, totalCount, abnormalCount] = await Promise.all([
      this.prisma.payment.aggregate({
        where,
        _sum: { amount: true, fee: true, net: true },
      }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.count({
        where: {
          ...where,
          status: { not: PrismaPaymentRecordStatusEnum.SUCCESS },
        },
      }),
    ]);

    return {
      totalAmount: toMoneyNumber(aggregate._sum.amount ?? 0),
      totalFee: toMoneyNumber(aggregate._sum.fee ?? 0),
      totalNet: toMoneyNumber(aggregate._sum.net ?? 0),
      totalCount,
      abnormalCount,
    };
  }

  // 通过 H5 入口 token 定位公开订单，并加载付款页所需基础信息
  async getPublicOrderByToken(token: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        qrCodeToken: token,
        deletedAt: null,
      },
      include: {
        tenant: true,
        lineItems: true,
      },
    });

    if (!order) {
      throw new BusinessException(40401, '路由无效，对应订单不存在', 404);
    }

    return order;
  }

  // 获取订单最新支付单，供 H5 状态合成和支付动作裁决使用
  async getLatestPaymentOrder(orderId: string, client: Prisma.TransactionClient | PrismaService = this.prisma) {
    return client.paymentOrder.findFirst({
      where: { orderId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  // 查询路径上顺手收敛超时中的在线支付单，避免 H5 长时间停留在 paying
  async expireIfNeeded(
    paymentOrder: Awaited<ReturnType<PaymentQueryService['getLatestPaymentOrder']>>,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (!paymentOrder || !shouldExpirePayingPaymentOrder(toPaymentDomainExpirableSnapshot(paymentOrder))) {
      return paymentOrder;
    }

    const transition = buildExpirePayingPaymentOrderTransition(toPaymentDomainExpirableSnapshot(paymentOrder));
    if (!transition.allowed) {
      return paymentOrder;
    }

    return client.paymentOrder.update({
      where: { id: paymentOrder.id },
      data: toPrismaPaymentOrderUpdateData(transition.data),
    });
  }

  // 将最新线下支付单投影成 H5 可展示的线下登记信息
  toOfflinePaymentInfo(
    paymentOrder: {
      paymentMethod: PrismaPaymentMethodEnum | null;
      offlineRemark: string | null;
      cashVerifyStatus: PrismaCashVerifyStatusEnum | null;
      offlineSubmittedAt: Date | null;
      cashVerifiedAt: Date | null;
    } | null,
  ): OfflinePaymentInfo | null {
    if (!paymentOrder?.offlineSubmittedAt || !paymentOrder.paymentMethod) {
      return null;
    }

    const selected = fromPrismaPaymentMethod(paymentOrder.paymentMethod);
    if (!selected || (selected !== PaymentMethodEnum.CASH && selected !== PaymentMethodEnum.OTHER_PAID)) {
      return null;
    }

    return {
      method: selected === PaymentMethodEnum.CASH ? OfflinePaymentMethodEnum.CASH : OfflinePaymentMethodEnum.OTHER_PAID,
      remark: paymentOrder.offlineRemark ?? '',
      cashVerifyStatus: paymentOrder.cashVerifyStatus ? fromPrismaCashVerifyStatus(paymentOrder.cashVerifyStatus) : null,
      cashVerifyStatusText:
        selected === PaymentMethodEnum.OTHER_PAID
          ? paymentOrder.cashVerifyStatus === PrismaCashVerifyStatusEnum.VERIFIED
            ? '已确认'
            : '待确认'
          : cashVerifyStatusText(paymentOrder.cashVerifyStatus),
      submittedAt: paymentOrder.offlineSubmittedAt.toISOString(),
      verifiedAt: paymentOrder.cashVerifiedAt?.toISOString() ?? null,
    };
  }

  /**
   * 当订单超过租户支付有效期时，统一覆写 H5 页面的状态和支付动作
   * 已完成支付或已进入待核销的订单保留原始业务终态
   */
  private async applyPaymentWindowOverride(input: {
    tenantId: string;
    orderTime: Date;
    status: PaymentOrderDetailResponse['status'];
    statusMessage?: string;
    paymentAction: PaymentAction;
  }): Promise<{
    status: PaymentOrderDetailResponse['status'];
    statusMessage?: string;
    paymentAction: PaymentAction;
  }> {
    if (input.status === PaymentOrderStatusEnum.PAID || input.status === PaymentOrderStatusEnum.PENDING_VERIFICATION) {
      return {
        status: input.status,
        statusMessage: input.statusMessage,
        paymentAction: input.paymentAction,
      };
    }

    const paymentWindow = await this.paymentWindowService.resolveOrderPaymentWindow({
      tenantId: input.tenantId,
      orderTime: input.orderTime,
    });
    if (!paymentWindow.isExpired) {
      return {
        status: input.status,
        statusMessage: input.statusMessage,
        paymentAction: input.paymentAction,
      };
    }

    return {
      status: PaymentOrderStatusEnum.EXPIRED,
      statusMessage: paymentWindow.expiredMessage ?? input.statusMessage,
      paymentAction: {
        canResume: false,
        resumeUrl: null,
        canInitiate: false,
        expiresAt: null,
      },
    };
  }

  // 基于订单事实和最新支付单裁决 H5 当前可执行的在线支付动作
  private buildPaymentAction(
    order: {
      voided: boolean;
      status: PrismaOrderStatusEnum;
      totalAmount: Prisma.Decimal;
      paid: Prisma.Decimal;
      tenantId: string;
      tenant: {
        activePaymentChannel: PrismaPaymentChannelEnum | null;
      };
    },
    paymentOrder: {
      status: PrismaPaymentOrderStatusEnum;
      paymentMethod: PrismaPaymentMethodEnum | null;
      cashierUrl: string | null;
      cashierExpiresAt: Date | null;
    } | null,
    status: PaymentStatusResponse['status'],
    activePaymentChannel: Awaited<ReturnType<PaymentTenantConfigService['getActivePaymentChannelSnapshot']>>,
  ): PaymentAction {
    const orderSnapshot = toPaymentDomainOrderSnapshot(order);
    const orderClosed = order.voided || orderSnapshot.status === OrderStatusEnum.EXPIRED;
    const orderPaid = decimal(order.paid).gte(order.totalAmount.toString()) || orderSnapshot.status === OrderStatusEnum.PAID;
    const isActiveOnlineAttempt =
      status === PaymentOrderStatusEnum.PAYING &&
      paymentOrder?.status === PrismaPaymentOrderStatusEnum.PAYING &&
      paymentOrder.paymentMethod === PrismaPaymentMethodEnum.ONLINE &&
      Boolean(paymentOrder.cashierUrl) &&
      Boolean(paymentOrder.cashierExpiresAt) &&
      dayjs(paymentOrder.cashierExpiresAt).isAfter(new Date());

    if (isActiveOnlineAttempt) {
      return {
        canResume: true,
        resumeUrl: paymentOrder.cashierUrl,
        canInitiate: false,
        expiresAt: paymentOrder.cashierExpiresAt?.toISOString() ?? null,
      };
    }

    const onlinePaymentAvailability = this.paymentTenantConfigService.resolveOnlinePaymentAvailability(activePaymentChannel);
    const canInitiate =
      !orderClosed &&
      !orderPaid &&
      (status === PaymentOrderStatusEnum.UNPAID || status === PaymentOrderStatusEnum.EXPIRED) &&
      paymentOrder?.status !== PrismaPaymentOrderStatusEnum.PENDING_VERIFICATION &&
      onlinePaymentAvailability.canInitiate;

    return {
      canResume: false,
      resumeUrl: null,
      canInitiate,
      expiresAt: null,
    };
  }

  // 平台视角查询跨租户收款流水，支持客户、租户和订单 ID 搜索
  private async getAdminPayments(query: PaymentListQuery): Promise<PaginatedResponse<AdminPaymentRecordItem>> {
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize);
    const where: Prisma.PaymentWhereInput = {};

    if (query.keyword?.trim()) {
      const keyword = query.keyword.trim();
      const orConditions: Prisma.PaymentWhereInput[] = [
        { customer: { contains: keyword, mode: 'insensitive' } },
        { tenant: { name: { contains: keyword, mode: 'insensitive' } } },
      ];
      if (isUuid(keyword)) {
        orConditions.push({ orderId: keyword });
      }
      where.OR = orConditions;
    }
    if (query.channel?.trim()) {
      where.channel = query.channel.trim();
    }

    const [records, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: { tenant: true },
        orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      list: records.map((item) => ({
        id: item.id,
        tenant: item.tenant.name,
        orderId: item.orderId,
        customer: item.customer,
        amount: toMoneyNumber(item.amount),
        channel: item.channel,
        fee: toMoneyNumber(item.fee),
        net: toMoneyNumber(item.net),
        time: formatDateTime(item.paidAt),
        status: fromPrismaPaymentRecordStatus(item.status),
      })),
      total,
      page,
      pageSize,
    };
  }

  // 平台视角统计全量当天收款汇总，不按租户过滤
  private async getAdminPaymentSummary(): Promise<PaymentSummaryResponse> {
    const start = dayjs().startOf('day').toDate();
    const end = dayjs().endOf('day').toDate();
    const where: Prisma.PaymentWhereInput = {
      paidAt: { gte: start, lte: end },
    };

    const [aggregate, totalCount, abnormalCount] = await Promise.all([
      this.prisma.payment.aggregate({
        where,
        _sum: { amount: true, fee: true, net: true },
      }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.count({
        where: {
          ...where,
          status: { not: PrismaPaymentRecordStatusEnum.SUCCESS },
        },
      }),
    ]);

    return {
      totalAmount: toMoneyNumber(aggregate._sum.amount ?? 0),
      totalFee: toMoneyNumber(aggregate._sum.fee ?? 0),
      totalNet: toMoneyNumber(aggregate._sum.net ?? 0),
      totalCount,
      abnormalCount,
    };
  }
}
