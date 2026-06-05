import { Injectable } from '@nestjs/common';
import {
  type Prisma,
  OfflinePaymentVerifyStatusEnum as PrismaOfflinePaymentVerifyStatusEnum,
  OrderStatusEnum as PrismaOrderStatusEnum,
  PaymentChannelEnum as PrismaPaymentChannelEnum,
  PaymentMethodEnum as PrismaPaymentMethodEnum,
  PaymentOrderStatusEnum as PrismaPaymentOrderStatusEnum,
  PaymentRecordStatusEnum as PrismaPaymentRecordStatusEnum,
} from '@prisma/client';

import type { PaginatedResponse } from '@shou/types/common';
import type {
  AdminPaymentRecordItem,
  OfflinePaymentAction,
  OfflinePaymentInfo,
  PaymentAction,
  PaymentListQuery,
  PaymentOrderDetailResponse,
  PaymentStatusResponse,
  PaymentSummaryResponse,
  TenantPaymentRecordItem,
} from '@shou/types/contracts';

import { OfflinePaymentMethodEnum, OrderStatusEnum, PaymentMethodEnum, PaymentOrderStatusEnum, type OrderStatus } from '@shou/types/enums';
import dayjs from 'dayjs';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { BusinessException } from '../common/exceptions/business.exception';
import { decimal, toDecimalNumber, toMoneyNumber } from '../common/money';
import { formatDateTime, normalizePage, normalizePageSize } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';

import {
  offlineVerifyStatusText,
  fromPrismaOfflinePaymentVerifyStatus,
  fromPrismaPaymentMethod,
  fromPrismaPaymentRecordStatus,
  toPaymentDomainExpirableSnapshot,
  toPaymentDomainOrderSnapshot,
  toPaymentDomainStatusSnapshot,
  toPrismaPaymentOrderUpdateData,
} from './mapping/payment.mapper';

import { PaymentTenantConfigService } from './payment-tenant-config.service';
import { PaymentTenantLifecycleService } from './payment-tenant-lifecycle.service';
import { PaymentWindowService } from './payment-window.service';
import { buildExpirePayingPaymentOrderTransition, resolvePaymentOrderStatus, shouldExpirePayingPaymentOrder } from './payment.domain';
import { buildPaymentOrderSummary, getPaymentTenantId, isUuid } from './payment.shared';

@Injectable()
export class PaymentQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentTenantConfigService: PaymentTenantConfigService,
    private readonly paymentTenantLifecycleService: PaymentTenantLifecycleService,
    private readonly paymentWindowService: PaymentWindowService,
  ) {}

  // 查询 H5 公开订单详情，并合成页面当前 H5 支付状态与支付动作
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
    const tenantLifecycle = this.paymentTenantLifecycleService.resolveH5PaymentLifecycle({
      tenantId: order.tenantId,
      status: order.tenant.status,
    });
    const paymentWindowState = await this.applyPaymentWindowOverride({
      tenantId: order.tenantId,
      createdAt: order.createdAt,
      status: resolvedStatus,
      statusMessage: this.resolveLifecycleStatusMessage(resolvedStatus, currentPaymentOrder?.statusMessage ?? undefined, tenantLifecycle),
      paymentAction: this.buildPaymentAction(order, currentPaymentOrder, resolvedStatus, activePaymentChannel, tenantLifecycle),
      offlinePaymentAction: this.buildOfflinePaymentAction(order, currentPaymentOrder, resolvedStatus, tenantLifecycle),
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
      offlinePaymentAction: paymentWindowState.offlinePaymentAction,
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

  // 查询订单维度的 H5 支付状态，供前端轮询网关回调结果
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
    const tenantLifecycle = this.paymentTenantLifecycleService.resolveH5PaymentLifecycle({
      tenantId: order.tenantId,
      status: order.tenant.status,
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
      createdAt: order.createdAt,
      status: resolvedStatus,
      statusMessage: this.resolveLifecycleStatusMessage(resolvedStatus, currentPaymentOrder?.statusMessage ?? undefined, tenantLifecycle),
      paymentAction: this.buildPaymentAction(order, currentPaymentOrder, resolvedStatus, activePaymentChannel, tenantLifecycle),
      offlinePaymentAction: this.buildOfflinePaymentAction(order, currentPaymentOrder, resolvedStatus, tenantLifecycle),
    });

    return {
      orderNo: order.id,
      status: paymentWindowState.status,
      statusMessage: paymentWindowState.statusMessage,
      paidAmount: paymentWindowState.status === PaymentOrderStatusEnum.PAID ? toMoneyNumber(order.paid) : undefined,
      paidAt: formatDateTime(latestPayment?.paidAt ?? currentPaymentOrder?.paidAt),
      selectedPaymentMethod: currentPaymentOrder ? (fromPrismaPaymentMethod(currentPaymentOrder.paymentMethod) ?? undefined) : undefined,
      paymentAction: paymentWindowState.paymentAction,
      offlinePaymentAction: paymentWindowState.offlinePaymentAction,
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

    const result = await client.paymentOrder.updateMany({
      where: { id: paymentOrder.id, status: PrismaPaymentOrderStatusEnum.PAYING },
      data: toPrismaPaymentOrderUpdateData(transition.data),
    });
    if (result.count === 0) {
      return paymentOrder;
    }
    return client.paymentOrder.findUnique({ where: { id: paymentOrder.id } });
  }

  // 将最新线下支付单投影成 H5 可展示的线下登记信息
  toOfflinePaymentInfo(
    paymentOrder: {
      paymentMethod: PrismaPaymentMethodEnum | null;
      offlineRemark: string | null;
      offlineVerifyStatus: PrismaOfflinePaymentVerifyStatusEnum | null;
      offlineSubmittedAt: Date | null;
      offlineVerifiedAt: Date | null;
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
      offlineVerifyStatus: paymentOrder.offlineVerifyStatus ? fromPrismaOfflinePaymentVerifyStatus(paymentOrder.offlineVerifyStatus) : null,
      offlineVerifyStatusText:
        selected === PaymentMethodEnum.OTHER_PAID
          ? paymentOrder.offlineVerifyStatus === PrismaOfflinePaymentVerifyStatusEnum.VERIFIED
            ? '已确认'
            : '待确认'
          : offlineVerifyStatusText(paymentOrder.offlineVerifyStatus),
      submittedAt: paymentOrder.offlineSubmittedAt.toISOString(),
      verifiedAt: paymentOrder.offlineVerifiedAt?.toISOString() ?? null,
    };
  }

  /**
   * 当订单超过租户支付有效期时，统一覆写 H5 页面的状态和支付动作
   * 已完成支付或已进入线下登记待确认的订单保留原始业务终态
   */
  private async applyPaymentWindowOverride(input: {
    tenantId: string;
    createdAt: Date;
    status: PaymentOrderDetailResponse['status'];
    statusMessage?: string;
    paymentAction: PaymentAction;
    offlinePaymentAction: OfflinePaymentAction;
  }): Promise<{
    status: PaymentOrderDetailResponse['status'];
    statusMessage?: string;
    paymentAction: PaymentAction;
    offlinePaymentAction: OfflinePaymentAction;
  }> {
    const paymentWindow = await this.paymentWindowService.resolveOrderPaymentWindow({
      tenantId: input.tenantId,
      createdAt: input.createdAt,
    });
    const paymentAction = {
      ...input.paymentAction,
      expiresAt: paymentWindow.payableUntilAt.toISOString(),
    };

    if (input.status === PaymentOrderStatusEnum.PAID || input.status === PaymentOrderStatusEnum.PENDING_VERIFICATION) {
      return {
        status: input.status,
        statusMessage: input.statusMessage,
        paymentAction,
        offlinePaymentAction: input.offlinePaymentAction,
      };
    }

    if (!paymentWindow.isExpired) {
      return {
        status: input.status,
        statusMessage: input.statusMessage,
        paymentAction,
        offlinePaymentAction: input.offlinePaymentAction,
      };
    }

    return {
      status: PaymentOrderStatusEnum.EXPIRED,
      statusMessage: paymentWindow.expiredMessage ?? input.statusMessage,
      paymentAction: {
        canResume: false,
        resumeUrl: null,
        canInitiate: false,
        expiresAt: paymentWindow.payableUntilAt.toISOString(),
      },
      offlinePaymentAction: {
        canSubmit: false,
        reason: paymentWindow.expiredMessage ?? '订单已超过商户设置的支付有效期，请联系商户处理',
      },
    };
  }

  // 基于订单、支付窗口前状态和租户生命周期裁决 H5 是否允许提交线下登记
  private buildOfflinePaymentAction(
    order: {
      voided: boolean;
      status: PrismaOrderStatusEnum;
      totalAmount: Prisma.Decimal;
      paid: Prisma.Decimal;
    },
    paymentOrder: {
      status: PrismaPaymentOrderStatusEnum;
    } | null,
    status: PaymentStatusResponse['status'],
    tenantLifecycle: ReturnType<PaymentTenantLifecycleService['resolveH5PaymentLifecycle']>,
  ): OfflinePaymentAction {
    const orderSnapshot = toPaymentDomainOrderSnapshot(order);
    const orderClosed = this.isOrderClosed(order.voided, orderSnapshot.status);
    const orderPaid = decimal(order.paid).gte(order.totalAmount.toString()) || orderSnapshot.status === OrderStatusEnum.PAID;

    if (!tenantLifecycle.canAcceptPayment) {
      return { canSubmit: false, reason: tenantLifecycle.failureMessage ?? '当前商户暂不可收款，请联系商户处理' };
    }

    if (orderClosed) {
      return { canSubmit: false, reason: '订单已关闭，无法提交线下登记' };
    }

    if (orderPaid || status === PaymentOrderStatusEnum.PAID) {
      return { canSubmit: false, reason: '订单已支付完成，不允许重复登记' };
    }

    if (status === PaymentOrderStatusEnum.PENDING_VERIFICATION || paymentOrder?.status === PrismaPaymentOrderStatusEnum.PENDING_VERIFICATION) {
      return { canSubmit: false, reason: '订单已登记线下支付，等待商户确认' };
    }

    if (status !== PaymentOrderStatusEnum.UNPAID) {
      return { canSubmit: false, reason: '当前状态不允许提交线下登记' };
    }

    return { canSubmit: true, reason: null };
  }

  // 租户生命周期阻断时覆盖可继续支付的非终态提示，已完成和线下登记待确认终态保持原业务文案
  private resolveLifecycleStatusMessage(
    status: PaymentOrderDetailResponse['status'],
    statusMessage: string | undefined,
    tenantLifecycle: ReturnType<PaymentTenantLifecycleService['resolveH5PaymentLifecycle']>,
  ): string | undefined {
    if (tenantLifecycle.canAcceptPayment || status === PaymentOrderStatusEnum.PAID || status === PaymentOrderStatusEnum.PENDING_VERIFICATION) {
      return statusMessage;
    }

    return tenantLifecycle.failureMessage ?? statusMessage;
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
    tenantLifecycle: ReturnType<PaymentTenantLifecycleService['resolveH5PaymentLifecycle']>,
  ): PaymentAction {
    const orderSnapshot = toPaymentDomainOrderSnapshot(order);
    const orderClosed = this.isOrderClosed(order.voided, orderSnapshot.status);
    const orderPaid = decimal(order.paid).gte(order.totalAmount.toString()) || orderSnapshot.status === OrderStatusEnum.PAID;
    const isActiveOnlineAttempt =
      tenantLifecycle.canAcceptPayment &&
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
        expiresAt: null,
      };
    }

    const onlinePaymentAvailability = this.paymentTenantConfigService.resolveOnlinePaymentAvailability(activePaymentChannel);
    const canInitiate =
      tenantLifecycle.canAcceptPayment &&
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

  // 判断订单是否已关闭，统一覆盖作废与过期两类终止态
  private isOrderClosed(voided: boolean, status: OrderStatus): boolean {
    return voided || status === OrderStatusEnum.EXPIRED || status === OrderStatusEnum.VOIDED;
  }
}
