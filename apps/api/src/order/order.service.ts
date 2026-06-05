import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, OrderStatusEnum as PrismaOrderStatusEnum } from '@prisma/client';
import type { PaginatedResponse } from '@shou/types/common';
import type {
  AdminOrderItem,
  CreateOrderRequest,
  TenantOrderItem,
  TenantOrderListItem,
  UpdateOrderRequest,
  VoidOrderRequest,
} from '@shou/types/contracts';
import { OrderPayTypeEnum } from '@shou/types/enums';
import { JwtPayload } from '../auth/decorators/current-user.decorator';
import { decimal, toMoney, toPrismaDecimal } from '../common/money';
import { generateQrCodeToken } from '../common/tokens';
import { cut, normalizeNullableText, normalizeText, parseDate } from '../common/validators';
import { ID_CONFIG } from '../id-generator/id-generator.constants';
import { IdGeneratorService } from '../id-generator/id-generator.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { fromPrismaOrderPayType, toPrismaOrderPayType, toPrismaOrderStatus } from './mapping/order-enum.mapper';
import { toLineItemCreateInput, toTenantOrder } from './mapping/order.mapper';
import { OrderOSQueryService } from './order-os-query.service';
import { OrderTenantQueryService } from './order-tenant-query.service';
import { deriveOrderStatus } from './order.domain';
import { getOrderTenantId } from './order.shared';
import { hasSettledOrderFlow, normalizeOrderLineItem, sumOrderLineItemAmount } from './order.validation';

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idGen: IdGeneratorService,
    private readonly osQueryService: OrderOSQueryService,
    private readonly tenantQueryService: OrderTenantQueryService,
  ) {}

  // 按登录态分派订单列表查询，租户侧自动注入 tenantId，OS 侧委托专用查询服务
  async findAll(currentUser: JwtPayload, query: ListOrdersQueryDto): Promise<PaginatedResponse<TenantOrderListItem | AdminOrderItem>> {
    if (!currentUser.tenantId) {
      return this.osQueryService.findAll(query);
    }
    return this.tenantQueryService.findAll(currentUser, query);
  }

  // 获取订单详情，租户侧限定当前 tenantId，OS 侧委托专用查询服务跨租户读取
  async getOrder(orderId: string, currentUser: JwtPayload): Promise<TenantOrderItem | AdminOrderItem> {
    if (!currentUser.tenantId) {
      return this.osQueryService.getOrder(orderId);
    }
    return this.tenantQueryService.getOrder(currentUser, orderId);
  }

  // 创建租户订单，并按金额、收款和结算方式派生初始订单状态
  async createOrder(currentUser: JwtPayload, request: CreateOrderRequest): Promise<TenantOrderItem> {
    const tenantId = this.getTenantId(currentUser);
    const amount = toMoney(request.amount, 'amount');
    const paid = decimal(0); // 新建订单默认已收金额为 0

    const payType = request.payType ?? OrderPayTypeEnum.CASH;
    const status = deriveOrderStatus(payType, amount, paid, false);
    const orderDate = parseDate(request.date, 'date') ?? new Date();
    const customer = normalizeText(request.customer, 'customer', 100);
    const customerPhone = normalizeNullableText(request.customerPhone, 30);
    const customerAddress = request.customerAddress?.trim() ? cut(request.customerAddress.trim(), 255) : '';

    const orderId = await this.idGen.nextDailyId(ID_CONFIG.ORDER.prefix, ID_CONFIG.ORDER.digits);
    const created = await this.prisma.order.create({
      data: {
        id: orderId,
        tenantId,
        qrCodeToken: generateQrCodeToken(),
        customer,
        customerPhone,
        customerAddress,
        totalAmount: toPrismaDecimal(amount),
        paid: toPrismaDecimal(paid),
        status: toPrismaOrderStatus(status),
        payType: toPrismaOrderPayType(payType),
        prints: 0,
        orderTime: orderDate,
      } as unknown as Prisma.OrderCreateInput,
      include: { lineItems: true },
    });

    return toTenantOrder(created);
  }

  // 更新租户订单基础信息，已进入支付或入账流程的订单禁止直接修改
  async updateOrder(currentUser: JwtPayload, orderId: string, request: UpdateOrderRequest): Promise<TenantOrderItem> {
    const tenantId = this.getTenantId(currentUser);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.order.findFirst({
        where: { id: orderId, tenantId, deletedAt: null },
        include: { lineItems: true },
      });

      if (!existing) {
        throw new NotFoundException('订单不存在');
      }
      if (existing.voided) {
        throw new ConflictException('已作废订单不允许更新');
      }
      if (await hasSettledOrderFlow(tx, existing.id)) {
        throw new ConflictException('订单已进入支付或入账流程，不允许直接更新');
      }

      const normalizedLineItems = request.lineItems ? request.lineItems.map((item) => normalizeOrderLineItem(item)) : undefined;
      const derivedAmount = normalizedLineItems ? sumOrderLineItemAmount(normalizedLineItems) : decimal(existing.totalAmount);
      const amount = request.amount !== undefined ? toMoney(request.amount, 'amount') : derivedAmount;
      if (amount.lte(0)) {
        throw new BadRequestException('amount 必须大于 0');
      }
      if (normalizedLineItems && request.amount !== undefined && !amount.equals(derivedAmount)) {
        throw new BadRequestException('amount 必须与 lineItems 合计金额一致');
      }

      const paid = decimal(existing.paid); // 禁用手动改单更新已收金额

      const payType = request.payType ?? fromPrismaOrderPayType(existing.payType);
      const status = deriveOrderStatus(payType, amount, paid, existing.voided);
      const orderTime = request.date ? parseDate(request.date, 'date') : existing.orderTime;
      const updated = await tx.order.update({
        where: { id: existing.id },
        data: {
          customer: request.customer !== undefined ? normalizeText(request.customer, 'customer', 100) : existing.customer,
          customerPhone:
            request.customerPhone !== undefined
              ? normalizeNullableText(request.customerPhone, 30)
              : ((existing as { customerPhone?: string | null }).customerPhone ?? null),
          customerAddress:
            request.customerAddress !== undefined
              ? cut(request.customerAddress.trim(), 255)
              : ((existing as { customerAddress?: string | null }).customerAddress ?? ''),
          totalAmount: toPrismaDecimal(amount),
          paid: toPrismaDecimal(paid),
          status: toPrismaOrderStatus(status),
          payType: toPrismaOrderPayType(payType),
          orderTime,
          customerFieldValues:
            request.customerFieldValues !== undefined ? (request.customerFieldValues as unknown as Prisma.InputJsonValue) : undefined,
          lineItems: normalizedLineItems
            ? {
                deleteMany: {},
                create: normalizedLineItems.map((item) => toLineItemCreateInput(item)),
              }
            : undefined,
        } as unknown as Prisma.OrderUpdateInput,
        include: { lineItems: true },
      });

      return toTenantOrder(updated);
    });
  }

  // 作废租户订单，已收款或已进入支付链路的订单不可作废
  async voidOrder(currentUser: JwtPayload, orderId: string, request: VoidOrderRequest): Promise<TenantOrderItem> {
    const tenantId = this.getTenantId(currentUser);

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, tenantId, deletedAt: null },
        include: { lineItems: true },
      });

      if (!order) {
        throw new NotFoundException('订单不存在');
      }
      if (order.voided) {
        throw new ConflictException('订单已作废');
      }
      if (decimal(order.paid).gt(0) || (await hasSettledOrderFlow(tx, order.id))) {
        throw new ConflictException('订单已进入支付或入账流程，不允许作废');
      }

      const voided = await tx.order.update({
        where: { id: order.id },
        data: {
          voided: true,
          voidReason: normalizeText(request.voidReason, 'voidReason', 255),
          voidedAt: new Date(),
          status: PrismaOrderStatusEnum.VOIDED,
        },
        include: { lineItems: true },
      });

      return toTenantOrder(voided);
    });
  }

  // 提取租户 ID，保持租户侧业务入口统一走同一个边界校验
  private getTenantId(currentUser: JwtPayload): string {
    return getOrderTenantId(currentUser);
  }
}
