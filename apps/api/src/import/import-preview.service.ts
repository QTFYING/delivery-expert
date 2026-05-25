import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  OrderImportPreviewError,
  OrderImportPreviewOrderResult,
  OrderImportPreviewRequest,
  OrderImportPreviewResponse,
} from '@shou/types/contracts';
import type { OrderStatus } from '@shou/types/enums';
import { randomUUID } from 'crypto';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { getImportTenantId } from './import.access';
import {
  buildImportPreviewKey,
  buildImportUserPreviewLockKey,
  IMPORT_PREVIEW_TTL_SECONDS,
  IMPORT_PREVIEW_USER_LOCK_SECONDS,
} from './import-preview.cache';
import { ImportTemplateService } from './import-template.service';
import { IMPORT_PREVIEW_MAX_LINE_ITEMS, IMPORT_PREVIEW_MAX_ORDERS } from './import.constants';
import { buildPreviewSummary, normalizePreviewOrder, type PreparedImportOrder, uniqueDuplicateOrders } from './import.normalizer';
import { type PreviewSnapshot } from './import.types';
import { fromPrismaOrderStatus, toTemplate } from './mapping/import.mapper';

@Injectable()
export class ImportPreviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly templateService: ImportTemplateService,
  ) {}

  // 为当前租户执行订单导入预检，并把可消费快照写入 Redis
  async previewImport(currentUser: JwtPayload, request: OrderImportPreviewRequest): Promise<OrderImportPreviewResponse> {
    const tenantId = getImportTenantId(currentUser);
    const userPreviewLockKey = buildImportUserPreviewLockKey(tenantId, currentUser.userId);
    const userPreviewLockValue = await this.redis.acquireLock(userPreviewLockKey, IMPORT_PREVIEW_USER_LOCK_SECONDS);
    if (!userPreviewLockValue) {
      throw new BadRequestException('当前用户已有预检进行中，请等待预检完成后再试');
    }

    try {
      const snapshot = await this.buildPreviewSnapshot(tenantId, request);
      await this.redis.setJson(buildImportPreviewKey(snapshot.previewId), snapshot, IMPORT_PREVIEW_TTL_SECONDS);

      return {
        previewId: snapshot.previewId,
        templateId: snapshot.templateId,
        summary: snapshot.summary,
        orders: snapshot.orders.map((order) => this.toPreviewOrderResult(order)),
        duplicateOrders: snapshot.duplicateOrders,
        invalidOrders: snapshot.invalidOrders,
      };
    } finally {
      await this.redis.releaseLock(userPreviewLockKey, userPreviewLockValue).catch(() => false);
    }
  }

  // 组装预检快照，负责模板约束、批次去重和库内重复订单探测
  private async buildPreviewSnapshot(tenantId: string, request: OrderImportPreviewRequest): Promise<PreviewSnapshot> {
    if (!request.orders?.length) {
      throw new BadRequestException('导入预检至少需要一张订单');
    }
    if (request.orders.length > IMPORT_PREVIEW_MAX_ORDERS) {
      throw new BadRequestException(`单次预检最多支持 ${IMPORT_PREVIEW_MAX_ORDERS} 条订单`);
    }

    const totalLineItemCount = request.orders.reduce((sum, order) => sum + (Array.isArray(order.lineItems) ? order.lineItems.length : 0), 0);
    if (totalLineItemCount > IMPORT_PREVIEW_MAX_LINE_ITEMS) {
      throw new BadRequestException(`订单明细总数 ${totalLineItemCount} 超过上限 ${IMPORT_PREVIEW_MAX_LINE_ITEMS}，请减少明细或分批导入`);
    }

    const template = toTemplate(await this.templateService.getScopedTemplate(tenantId, request.templateId));

    const { importRevision } = (await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { importRevision: true },
    })) ?? { importRevision: 0 };

    const valueRequiredMap = new Map<string, boolean>();
    [...template.defaultFields, ...template.customerFields].forEach((field) => {
      valueRequiredMap.set(field.key, field.isValueRequired ?? false);
    });
    const fieldLabelMap = new Map([...template.defaultFields, ...template.customerFields].map((field) => [field.key, field.label]));
    const allCustomerFieldMap = new Map(template.customerFields.map((field) => [field.key, field]));
    const listCustomerFieldMap = new Map(
      template.customerFields.filter((field) => (field.type ?? 'list') === 'list').map((field) => [field.key, field]),
    );
    const lineCustomerFieldMap = new Map(template.customerFields.filter((field) => field.type === 'line').map((field) => [field.key, field]));
    const invalidErrors: OrderImportPreviewError[] = [];
    const normalizedOrders: PreparedImportOrder[] = [];

    request.orders.forEach((order, index) => {
      const prepared = normalizePreviewOrder(
        order,
        index + 1,
        String(template.id),
        listCustomerFieldMap,
        lineCustomerFieldMap,
        allCustomerFieldMap,
        fieldLabelMap,
        valueRequiredMap,
      );
      if ('error' in prepared) {
        invalidErrors.push(...prepared.error);
        return;
      }
      normalizedOrders.push(prepared.value);
    });

    const batchCountMap = normalizedOrders.reduce<Map<string, number>>((acc, order) => {
      acc.set(order.sourceOrderNo, (acc.get(order.sourceOrderNo) ?? 0) + 1);
      return acc;
    }, new Map());

    const validOrders = normalizedOrders.filter((order) => {
      const currentCount = batchCountMap.get(order.sourceOrderNo) ?? 0;
      if (currentCount <= 1) {
        return true;
      }
      invalidErrors.push({
        index: order.index,
        sourceOrderNo: order.sourceOrderNo,
        field: 'sourceOrderNo',
        reason: '当前批次存在重复的源订单号',
      });
      return false;
    });

    const existingMap = await this.loadExistingOrderMap(tenantId, Array.from(new Set(validOrders.map((order) => order.sourceOrderNo))));

    const duplicateOrders = validOrders
      .filter((order) => existingMap.has(order.sourceOrderNo))
      .map((order) => {
        const existing = existingMap.get(order.sourceOrderNo)!;
        return {
          sourceOrderNo: order.sourceOrderNo,
          existingOrderId: existing.id,
          customer: existing.customer,
          totalAmount: existing.totalAmount,
          existingStatus: existing.status,
          incomingCount: batchCountMap.get(order.sourceOrderNo) ?? 1,
        };
      });

    return {
      previewId: randomUUID(),
      tenantId,
      templateId: String(template.id),
      importRevision,
      summary: buildPreviewSummary(request.orders.length, validOrders, invalidErrors, duplicateOrders),
      orders: validOrders,
      duplicateOrders: uniqueDuplicateOrders(duplicateOrders),
      invalidOrders: invalidErrors,
    };
  }

  // 将内部 PreparedImportOrder 投影为对外预检响应结构
  private toPreviewOrderResult(order: PreparedImportOrder): OrderImportPreviewOrderResult {
    return {
      sourceOrderNo: order.sourceOrderNo,
      groupKey: order.groupKey,
      customer: order.customer,
      customerPhone: order.customerPhone,
      customerAddress: order.customerAddress,
      totalAmount: order.totalAmount,
      orderTime: order.orderTime,
      payType: order.payType,
      customerFieldValues: order.customerFieldValues,
      mappingTemplateId: order.mappingTemplateId,
      lineItems: order.lineItems,
    };
  }

  // 查询当前租户批次内命中的历史订单，用于构建库内重复订单提示
  private async loadExistingOrderMap(
    tenantId: string,
    sourceOrderNos: string[],
  ): Promise<Map<string, { id: string; customer: string; totalAmount: number; status: OrderStatus }>> {
    if (sourceOrderNos.length === 0) {
      return new Map();
    }

    const existing = await this.prisma.order.findMany({
      where: { tenantId, sourceOrderNo: { in: sourceOrderNos }, deletedAt: null },
      select: { id: true, sourceOrderNo: true, customer: true, totalAmount: true, status: true },
    });

    return new Map(
      existing
        .filter((item): item is typeof item & { sourceOrderNo: string } => Boolean(item.sourceOrderNo))
        .map((item) => [
          item.sourceOrderNo,
          {
            id: item.id,
            customer: item.customer,
            totalAmount: Number(item.totalAmount.toFixed(2)),
            status: fromPrismaOrderStatus(item.status),
          },
        ]),
    );
  }
}
