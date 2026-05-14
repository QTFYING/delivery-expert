import { Injectable } from '@nestjs/common';
import type { PaginatedResponse } from '@shou/types/common';
import type {
  AdminPaymentRecordItem,
  CreateCashVerificationResponse,
  InitiatePaymentResponse,
  PaymentListQuery,
  PaymentOrderDetailResponse,
  PaymentStatusResponse,
  PaymentSummaryResponse,
  SubmitOfflinePaymentRequest,
  SubmitOfflinePaymentResponse,
  TenantPaymentRecordItem,
} from '@shou/types/contracts';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import type { LakalaWebhookRequest } from './gateway/lakala-webhook.normalizer';
import { PaymentOperationService } from './payment-operation.service';
import { PaymentQueryService } from './payment-query.service';
import { type LakalaWebhookContext, PaymentWebhookService } from './payment-webhook.service';

@Injectable()
export class PaymentService {
  constructor(
    private readonly queryService: PaymentQueryService,
    private readonly operationService: PaymentOperationService,
    private readonly webhookService: PaymentWebhookService,
  ) {}

  // 查询 H5 公开订单详情，供付款页初始化展示
  async getPaymentDetail(token: string): Promise<PaymentOrderDetailResponse> {
    return this.queryService.getPaymentDetail(token);
  }

  // 发起 H5 在线支付，实际金额由服务端按订单当前状态核算
  async initiatePayment(token: string): Promise<InitiatePaymentResponse> {
    return this.operationService.initiatePayment(token);
  }

  // 登记 H5 线下支付选择，只处理公开付款页允许的线下方式
  async submitOfflinePayment(token: string, request: SubmitOfflinePaymentRequest): Promise<SubmitOfflinePaymentResponse> {
    return this.operationService.submitOfflinePayment(token, request);
  }

  // 查询订单维度的 H5 收款状态，不把入口 token 当作支付单 token 使用
  async getPaymentStatus(token: string): Promise<PaymentStatusResponse> {
    return this.queryService.getPaymentStatus(token);
  }

  // 查询租户或平台视角的收款流水列表，权限边界由 query service 收口
  async getPayments(currentUser: JwtPayload, query: PaymentListQuery): Promise<PaginatedResponse<TenantPaymentRecordItem | AdminPaymentRecordItem>> {
    return this.queryService.getPayments(currentUser, query);
  }

  // 查询当前用户视角下的收款汇总统计
  async getPaymentSummary(currentUser: JwtPayload): Promise<PaymentSummaryResponse> {
    return this.queryService.getPaymentSummary(currentUser);
  }

  // 租户财务核销现金待确认支付单，并写入统一收款流水
  async createCashVerification(currentUser: JwtPayload, orderId: string): Promise<CreateCashVerificationResponse> {
    return this.operationService.createCashVerification(currentUser, orderId);
  }

  // 处理拉卡拉 Webhook 请求快照，入口解析与业务结算由 webhook service 负责
  async handleLakalaWebhook(request: LakalaWebhookRequest, context: LakalaWebhookContext) {
    return this.webhookService.handleLakalaWebhook(request, context);
  }
}
