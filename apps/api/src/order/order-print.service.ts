import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
import { formatDateTime, normalizeOptionalText, normalizeText } from '../common/validators';
import { ID_CONFIG } from '../id-generator/id-generator.constants';
import { IdGeneratorService } from '../id-generator/id-generator.service';
import { PrismaService } from '../prisma/prisma.service';
import { fromPrismaPrintRecordResult } from './mapping/order-enum.mapper';
import { getOrderActorName, getOrderTenantId } from './order.shared';

@Injectable()
export class OrderPrintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idGen: IdGeneratorService,
  ) {}

  // 提交单订单打印成功回执，并按 requestId 保证重复提交幂等
  async createPrintRecord(currentUser: JwtPayload, request: OrderPrintRecordRequest): Promise<OrderPrintRecordResponse> {
    const tenantId = getOrderTenantId(currentUser);
    const orderId = this.resolveSinglePrintOrderId(request);
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
        if (existing.orderId !== orderId) {
          throw new ConflictException('requestId 已被其他订单的打印成功事件占用');
        }
        return this.buildExistingPrintRecordResponse(existing);
      }
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    const operatorName = await getOrderActorName(this.prisma, currentUser.userId);
    const printedAt = new Date();
    const recordId = await this.idGen.nextDailyId(ID_CONFIG.ORDER_PRINT.prefix, ID_CONFIG.ORDER_PRINT.digits);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.orderPrintRecord.create({
          data: {
            id: recordId,
            tenantId,
            orderId,
            operatorId: currentUser.userId,
            operatorName,
            result: PrismaPrintRecordResultEnum.SUCCESS,
            requestId: requestId ?? null,
            printedAt,
            remark: remark ?? null,
            createdAt: printedAt,
          },
        });

        const updated = await tx.order.updateMany({
          where: { tenantId, id: orderId, deletedAt: null },
          data: {
            prints: { increment: 1 },
            lastPrintedAt: printedAt,
          },
        });

        return {
          requestId,
          totalCount: 1,
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
          if (existing.orderId !== orderId) {
            throw new ConflictException('requestId 已被其他订单的打印成功事件占用');
          }
          return this.buildExistingPrintRecordResponse(existing);
        }
      }
      throw error;
    }
  }

  // 将新字段 orderId 与旧字段 orderIds 归一为单个订单 ID，并阻断伪批量入参
  private resolveSinglePrintOrderId(request: OrderPrintRecordRequest): string {
    const orderId = normalizeOptionalText(request.orderId);
    if (request.orderIds !== undefined) {
      if (!Array.isArray(request.orderIds)) {
        throw new BadRequestException('orderIds 必须是数组');
      }
      if (request.orderIds.length !== 1) {
        throw new BadRequestException('orderIds 仅兼容单订单回执，长度必须为 1');
      }

      const legacyOrderId = normalizeOptionalText(request.orderIds[0]);
      if (!legacyOrderId) {
        throw new BadRequestException('orderIds[0] 不能为空');
      }
      if (orderId && orderId !== legacyOrderId) {
        throw new BadRequestException('orderId 与 orderIds[0] 必须一致');
      }

      return orderId ?? legacyOrderId;
    }

    if (!orderId) {
      throw new BadRequestException('orderId 不能为空');
    }

    return orderId;
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

  // 将已存在的成功打印事件回放为接口响应，保证单订单回执幂等返回稳定
  private buildExistingPrintRecordResponse(existing: { requestId: string | null; printedAt: Date; remark: string | null }): OrderPrintRecordResponse {
    return {
      requestId: existing.requestId ?? undefined,
      totalCount: 1,
      successCount: 1,
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
