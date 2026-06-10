import { Injectable, Logger } from '@nestjs/common';
import type { OrderExportQuery } from '@shou/types/contracts';
import type { Response } from 'express';
import dayjs from 'dayjs';
import ExcelJS from 'exceljs';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { toMoneyNumber } from '../common/money';
import { formatDateTime } from '../common/validators';
import { asCustomerTemplateFields } from '../import/mapping/import.mapper';
import { PaymentWindowService } from '../payment/payment-window.service';
import { PrismaService } from '../prisma/prisma.service';
import { fromPrismaOrderPayType, fromPrismaOrderStatus } from './mapping/order-enum.mapper';
import { orderStatusText, payTypeText } from './mapping/order-display';
import { buildOrderListWhere } from './order.query';
import { getOrderTenantId, latestSuccessfulPaymentInclude } from './order.shared';

// 「发货日期」并非系统字段，而是租户映射模板里的自定义字段，导出时按字段名匹配
const DELIVERY_DATE_FIELD_LABEL = '发货日期';
// 游标分页每批行数；内存恒定，与最终导出量无关
const EXPORT_BATCH_SIZE = 1000;
// 运行时长护栏：正常按筛选条件不会触达，仅防止全量历史导出长时间占用
const MAX_EXPORT_ROWS = 100_000;

@Injectable()
export class OrderExportService {
  private readonly logger = new Logger(OrderExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentWindowService: PaymentWindowService,
  ) {}

  // 按列表筛选条件（或指定 ids）流式导出当前租户订单为 xlsx，边查边写，内存恒定
  async streamOrders(currentUser: JwtPayload, query: OrderExportQuery, response: Response): Promise<void> {
    const tenantId = getOrderTenantId(currentUser);
    const qrCodeExpiryDays = await this.paymentWindowService.getTenantQrCodeExpiryDays(tenantId);
    const where = buildOrderListWhere(tenantId, query, [{ tenantId, qrCodeExpiryDays }]);
    if (query.ids?.length) {
      where.id = { in: query.ids };
    }

    // 模板数量极少，一次性按租户加载并解析「发货日期」cfN，避免逐批查询
    const deliveryKeyByTemplate = await this.loadDeliveryDateKeys(tenantId);

    const fileName = `orders-${dayjs().format('YYYYMMDDHHmmss')}.xlsx`;
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: response, useStyles: true });
    const sheet = workbook.addWorksheet('订单');
    sheet.columns = [
      { header: '系统订单号', key: 'id', width: 22 },
      { header: '单据编号', key: 'sourceOrderNo', width: 22 },
      { header: '客户名称', key: 'customer', width: 20 },
      { header: '发货日期', key: 'deliveryDate', width: 16 },
      { header: '订单金额', key: 'totalAmount', width: 14 },
      { header: '收款状态', key: 'status', width: 12 },
      { header: '结算方式', key: 'payType', width: 12 },
      { header: '收款日期', key: 'paidAt', width: 20 },
      { header: '登记确认备注', key: 'paymentRemark', width: 30 },
    ];
    sheet.getRow(1).font = { bold: true };

    try {
      let cursor: string | undefined;
      let exported = 0;
      for (;;) {
        const batch = await this.prisma.order.findMany({
          where,
          include: { payments: latestSuccessfulPaymentInclude },
          orderBy: [{ id: 'desc' }],
          take: EXPORT_BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });
        if (batch.length === 0) {
          break;
        }

        for (const order of batch) {
          const cfKey = order.mappingTemplateId != null ? deliveryKeyByTemplate.get(order.mappingTemplateId.toString()) : undefined;
          const customerFieldValues = (order.customerFieldValues ?? {}) as Record<string, unknown>;
          const latestPayment = order.payments?.[0];
          sheet
            .addRow({
              id: order.id,
              sourceOrderNo: order.sourceOrderNo ?? '',
              customer: order.customer,
              deliveryDate: cfKey ? String(customerFieldValues[cfKey] ?? '') : '',
              totalAmount: toMoneyNumber(order.totalAmount),
              status: orderStatusText(fromPrismaOrderStatus(order.status)),
              payType: payTypeText(fromPrismaOrderPayType(order.payType)),
              paidAt: formatDateTime(latestPayment?.paidAt ?? null) ?? '',
              paymentRemark: latestPayment?.remark ?? '',
            })
            .commit();
        }

        exported += batch.length;
        cursor = batch[batch.length - 1].id;
        if (batch.length < EXPORT_BATCH_SIZE) {
          break;
        }
        if (exported >= MAX_EXPORT_ROWS) {
          this.logger.warn(`订单导出触达行数护栏 ${MAX_EXPORT_ROWS} - 租户: ${tenantId}，结果可能被截断，请缩小筛选条件`);
          break;
        }
      }

      sheet.commit();
      await workbook.commit();
    } catch (error) {
      // 已开始写流则无法再返回 JSON 错误，断开连接交由客户端感知
      if (response.headersSent) {
        response.destroy();
      }
      throw error;
    }
  }

  // 按租户加载全部未删除模板，解析各自「发货日期」对应的 cfN（不同模板 cfN 含义不同）
  private async loadDeliveryDateKeys(tenantId: string): Promise<Map<string, string | undefined>> {
    const templates = await this.prisma.importTemplate.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, customerFields: true },
    });

    const keyByTemplate = new Map<string, string | undefined>();
    for (const template of templates) {
      const field = asCustomerTemplateFields(template.customerFields).find(
        (item) => (item.type ?? 'list') !== 'line' && item.label === DELIVERY_DATE_FIELD_LABEL,
      );
      keyByTemplate.set(template.id.toString(), field?.key);
    }
    return keyByTemplate;
  }
}
