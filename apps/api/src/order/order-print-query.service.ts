import { Injectable, NotFoundException } from '@nestjs/common';
import { PrintRecordResultEnum as PrismaPrintRecordResultEnum } from '@prisma/client';
import type { OrderPrintRecordsQuery, OrderPrintRecordsResponse, TenantPrintRecordsQuery, TenantPrintRecordsResponse } from '@shou/types/contracts';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { formatDateTime, normalizePage, normalizePageSize } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import { fromPrismaPrintRecordResult, toPrismaPrintRecordResult } from './mapping/order-enum.mapper';
import { buildOrderPrintWhere, buildTenantPrintWhere } from './order-print.query';
import { getOrderTenantId } from './order.shared';

@Injectable()
export class OrderPrintQueryService {
  constructor(private readonly prisma: PrismaService) {}

  // 获取单个订单的打印事件历史
  async getOrderPrintRecords(currentUser: JwtPayload, orderId: string, query: OrderPrintRecordsQuery): Promise<OrderPrintRecordsResponse> {
    const tenantId = getOrderTenantId(currentUser);
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize);

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId, deletedAt: null },
      select: {
        prints: true,
        printFailedCount: true,
        lastPrintedAt: true,
        lastFailedAt: true,
      },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    const where = buildOrderPrintWhere(tenantId, orderId, query);
    const [records, total] = await Promise.all([
      this.prisma.orderPrintRecord.findMany({
        where,
        orderBy: [{ printedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.orderPrintRecord.count({ where }),
    ]);

    return {
      list: records.map((record) => ({
        id: record.id,
        result: fromPrismaPrintRecordResult(record.result),
        failureReason: record.failureReason ?? null,
        printedAt: this.formatRequiredDateTime(record.printedAt),
        operatorId: record.operatorId ?? null,
        operatorName: record.operatorName ?? null,
        requestId: record.requestId ?? null,
        remark: record.remark ?? null,
      })),
      total,
      page,
      pageSize,
      summary: {
        successCount: order.prints,
        failedCount: order.printFailedCount,
        lastPrintedAt: this.formatNullableDateTime(order.lastPrintedAt),
        lastFailedAt: this.formatNullableDateTime(order.lastFailedAt),
      },
    };
  }

  // 获取当前租户的跨订单打印追溯列表
  async getTenantPrintRecords(currentUser: JwtPayload, query: TenantPrintRecordsQuery): Promise<TenantPrintRecordsResponse> {
    const tenantId = getOrderTenantId(currentUser);
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize ?? 50);
    const where = buildTenantPrintWhere(tenantId, query, true);

    const [records, total] = await Promise.all([
      this.prisma.orderPrintRecord.findMany({
        where,
        include: {
          order: {
            select: {
              sourceOrderNo: true,
              customer: true,
            },
          },
        },
        orderBy: [{ printedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.orderPrintRecord.count({ where }),
    ]);
    const [successCount, failedCount] = await Promise.all([
      this.countTenantPrintRecordsByResult(tenantId, query, total, PrismaPrintRecordResultEnum.SUCCESS),
      this.countTenantPrintRecordsByResult(tenantId, query, total, PrismaPrintRecordResultEnum.FAILED),
    ]);

    return {
      list: records.map((record) => ({
        id: record.id,
        orderId: record.orderId,
        sourceOrderNo: record.order.sourceOrderNo ?? '',
        customer: record.order.customer,
        result: fromPrismaPrintRecordResult(record.result),
        failureReason: record.failureReason ?? null,
        printedAt: this.formatRequiredDateTime(record.printedAt),
        operatorId: record.operatorId ?? null,
        operatorName: record.operatorName ?? null,
        remark: record.remark ?? null,
      })),
      total,
      page,
      pageSize,
      summary: {
        successCount,
        failedCount,
      },
    };
  }

  // 统计当前租户指定结果的打印事件数量
  private async countTenantPrintRecordsByResult(
    tenantId: string,
    query: TenantPrintRecordsQuery,
    total: number,
    result: PrismaPrintRecordResultEnum,
  ): Promise<number> {
    if (query.result) {
      return toPrismaPrintRecordResult(query.result) === result ? total : 0;
    }

    const where = buildTenantPrintWhere(tenantId, query, false);
    return this.prisma.orderPrintRecord.count({
      where: {
        ...where,
        result,
      },
    });
  }

  // 格式化必填时间字段，保持接口输出稳定
  private formatRequiredDateTime(value: Date): string {
    return formatDateTime(value) ?? value.toISOString();
  }

  // 格式化可空时间字段
  private formatNullableDateTime(value: Date | null): string | null {
    return value ? this.formatRequiredDateTime(value) : null;
  }
}
