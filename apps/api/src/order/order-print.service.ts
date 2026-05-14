import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditResultEnum as PrismaAuditResultEnum,
  AuditTargetTypeEnum as PrismaAuditTargetTypeEnum,
  PrintRecordResultEnum as PrismaPrintRecordResultEnum,
} from '@prisma/client';
import type {
  CreateOrderPrintFailureRequest,
  CreateOrderPrintFailureResponse,
  OrderPrintRecordRequest,
  OrderPrintRecordResponse,
} from '@shou/types/contracts';
import { PrintRecordResultEnum } from '@shou/types/enums';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { isUniqueConflict } from '../common/prisma-errors';
import { formatDateTime, normalizeIdArray, normalizeOptionalText, normalizeText } from '../common/validators';
import { ID_CONFIG } from '../id-generator/id-generator.constants';
import { IdGeneratorService } from '../id-generator/id-generator.service';
import { PrismaService } from '../prisma/prisma.service';
import { fromPrismaPrintRecordResult } from './mapping/order-enum.mapper';
import { assertAllOrdersOwned, getOrderActorName, getOrderTenantId } from './order.shared';

@Injectable()
export class OrderPrintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idGen: IdGeneratorService,
  ) {}

  // 提交打印成功回执，并按批次累计订单打印次数
  async createPrintRecord(currentUser: JwtPayload, request: OrderPrintRecordRequest): Promise<OrderPrintRecordResponse> {
    const tenantId = getOrderTenantId(currentUser);
    const orderIds = normalizeIdArray(request.orderIds, 'orderIds');
    const requestId = normalizeOptionalText(request.requestId);
    const remark = normalizeOptionalText(request.remark);

    if (requestId) {
      const existing = await this.prisma.orderPrintRecord.findFirst({
        where: { tenantId, requestId },
      });
      if (existing) {
        if (fromPrismaPrintRecordResult(existing.result) !== PrintRecordResultEnum.SUCCESS) {
          throw new ConflictException('requestId 已被其他打印事件占用');
        }
        return this.buildExistingPrintRecordResponse(tenantId, existing);
      }
    }

    await assertAllOrdersOwned(this.prisma, tenantId, orderIds);
    const operatorName = await getOrderActorName(this.prisma, currentUser.userId);
    const printedAt = new Date();
    const recordIds = await Promise.all(orderIds.map(() => this.idGen.nextDailyId(ID_CONFIG.ORDER_PRINT.prefix, ID_CONFIG.ORDER_PRINT.digits)));

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.orderPrintRecord.createMany({
          data: orderIds.map((orderId, index) => ({
            id: recordIds[index],
            tenantId,
            orderId,
            operatorId: currentUser.userId,
            operatorName,
            result: PrismaPrintRecordResultEnum.SUCCESS,
            requestId: index === 0 ? (requestId ?? null) : null,
            printedAt,
            remark: remark ?? null,
            createdAt: printedAt,
          })),
        });

        const updated = await tx.order.updateMany({
          where: { tenantId, id: { in: orderIds }, deletedAt: null },
          data: {
            prints: { increment: 1 },
            lastPrintedAt: printedAt,
          },
        });

        return {
          requestId,
          totalCount: orderIds.length,
          successCount: updated.count,
          confirmedAt: this.formatRequiredDateTime(printedAt),
          remark,
        };
      });
    } catch (error) {
      if (requestId && isUniqueConflict(error)) {
        const existing = await this.prisma.orderPrintRecord.findFirst({
          where: { tenantId, requestId },
        });
        if (existing) {
          if (fromPrismaPrintRecordResult(existing.result) !== PrintRecordResultEnum.SUCCESS) {
            throw new ConflictException('requestId 已被其他打印事件占用');
          }
          return this.buildExistingPrintRecordResponse(tenantId, existing);
        }
      }
      throw error;
    }
  }

  // 上报单订单打印失败记录，并写入失败审计
  async createPrintFailure(
    currentUser: JwtPayload,
    orderId: string,
    request: CreateOrderPrintFailureRequest,
  ): Promise<CreateOrderPrintFailureResponse> {
    const tenantId = getOrderTenantId(currentUser);
    const reason = normalizeText(request.reason, 'reason', 500);
    const requestId = normalizeOptionalText(request.requestId);
    const remark = normalizeOptionalText(request.remark);

    if (requestId) {
      const existing = await this.prisma.orderPrintRecord.findFirst({
        where: { tenantId, requestId },
      });
      if (existing) {
        if (fromPrismaPrintRecordResult(existing.result) !== PrintRecordResultEnum.FAILED) {
          throw new ConflictException('requestId 已被其他打印事件占用');
        }
        if (existing.orderId !== orderId) {
          throw new ConflictException('requestId 已被其他订单的打印失败事件占用');
        }
        return this.toCreatePrintFailureResponse(existing);
      }
    }

    const count = await this.prisma.order.count({
      where: { id: orderId, tenantId, deletedAt: null },
    });
    if (count === 0) {
      throw new NotFoundException('订单不存在');
    }

    const operatorName = await getOrderActorName(this.prisma, currentUser.userId);
    const printedAt = new Date();
    const recordId = await this.idGen.nextDailyId(ID_CONFIG.ORDER_PRINT.prefix, ID_CONFIG.ORDER_PRINT.digits);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.orderPrintRecord.create({
          data: {
            id: recordId,
            tenantId,
            orderId,
            operatorId: currentUser.userId,
            operatorName,
            result: PrismaPrintRecordResultEnum.FAILED,
            failureReason: reason,
            requestId: requestId ?? null,
            printedAt,
            remark: remark ?? null,
            createdAt: printedAt,
          },
        });

        await tx.order.update({
          where: { id: orderId },
          data: {
            printFailedCount: { increment: 1 },
            lastFailedAt: printedAt,
          },
        });

        await tx.auditLog.create({
          data: {
            actor: operatorName,
            action: '打印失败记录',
            target: orderId,
            targetType: PrismaAuditTargetTypeEnum.TENANT,
            tenantId,
            result: PrismaAuditResultEnum.SUCCESS,
          },
        });

        return this.toCreatePrintFailureResponse(created);
      });
    } catch (error) {
      if (requestId && isUniqueConflict(error)) {
        const existing = await this.prisma.orderPrintRecord.findFirst({
          where: { tenantId, requestId },
        });
        if (existing) {
          if (fromPrismaPrintRecordResult(existing.result) !== PrintRecordResultEnum.FAILED) {
            throw new ConflictException('requestId 已被其他打印事件占用');
          }
          if (existing.orderId !== orderId) {
            throw new ConflictException('requestId 已被其他订单的打印失败事件占用');
          }
          return this.toCreatePrintFailureResponse(existing);
        }
      }
      throw error;
    }
  }

  // 将已存在的成功打印批次回放为接口响应，保证幂等返回稳定
  private async buildExistingPrintRecordResponse(
    tenantId: string,
    existing: {
      requestId: string | null;
      printedAt: Date;
      createdAt: Date;
      operatorId: string | null;
      remark: string | null;
    },
  ): Promise<OrderPrintRecordResponse> {
    const totalCount = await this.prisma.orderPrintRecord.count({
      where: {
        tenantId,
        result: PrismaPrintRecordResultEnum.SUCCESS,
        printedAt: existing.printedAt,
        createdAt: existing.createdAt,
        operatorId: existing.operatorId,
        remark: existing.remark,
      },
    });

    const resolvedCount = totalCount > 0 ? totalCount : 1;
    return {
      requestId: existing.requestId ?? undefined,
      totalCount: resolvedCount,
      successCount: resolvedCount,
      confirmedAt: this.formatRequiredDateTime(existing.printedAt),
      remark: existing.remark ?? undefined,
    };
  }

  // 将失败打印记录映射为标准响应结构
  private toCreatePrintFailureResponse(record: {
    id: string;
    orderId: string;
    failureReason: string | null;
    printedAt: Date;
    operatorName: string | null;
  }): CreateOrderPrintFailureResponse {
    return {
      id: record.id,
      orderId: record.orderId,
      reason: record.failureReason ?? '',
      printedAt: this.formatRequiredDateTime(record.printedAt),
      operatorName: record.operatorName ?? null,
    };
  }

  // 格式化必填时间字段，保持接口输出稳定
  private formatRequiredDateTime(value: Date): string {
    return formatDateTime(value) ?? value.toISOString();
  }
}
