import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiParam, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { TenantPermissionCodeEnum, UserRoleEnum } from '@shou/types/enums';
import type { PaginatedResponse } from '@shou/types/common';
import type {
  AdminPaymentRecordItem,
  CreateOfflinePaymentVerificationRequest,
  CreateOfflinePaymentVerificationResponse,
  PaymentListQuery,
  PaymentSummaryResponse,
  TenantPaymentRecordItem,
} from '@shou/types/contracts';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../authorization/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { CreateOfflinePaymentVerificationDto } from './dto/create-offline-payment-verification.dto';
import { ListPaymentsQueryDto } from './dto/list-payments.query.dto';
import { PaymentService } from './payment.service';
import {
  AdminPaymentListResponseSwagger,
  CreateOfflinePaymentVerificationResponseSwagger,
  PaymentSummaryResponseSwagger,
  TenantPaymentListResponseSwagger,
} from './payment.swagger';

@ApiTags('Payments')
@ApiBearerAuth()
@ApiExtraModels(
  TenantPaymentListResponseSwagger,
  AdminPaymentListResponseSwagger,
  PaymentSummaryResponseSwagger,
  CreateOfflinePaymentVerificationResponseSwagger,
)
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class TenantPaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // 查询租户侧或平台侧的收款流水列表
  @ApiOperation({ summary: '获取收款流水列表' })
  @ApiOkResponse({
    schema: {
      oneOf: [{ $ref: getSchemaPath(TenantPaymentListResponseSwagger) }, { $ref: getSchemaPath(AdminPaymentListResponseSwagger) }],
    },
  })
  @Get('payments')
  @Roles(UserRoleEnum.OS_SUPER_ADMIN)
  @Permissions(TenantPermissionCodeEnum.PAYMENTS_READ)
  async getPayments(
    @CurrentUser() currentUser: JwtPayload,
    @Query() query: ListPaymentsQueryDto,
  ): Promise<PaginatedResponse<TenantPaymentRecordItem | AdminPaymentRecordItem>> {
    return this.paymentService.getPayments(currentUser, query as PaymentListQuery);
  }

  // 查询收款汇总统计，供平台或租户财务视图展示
  @ApiOperation({ summary: '获取收款汇总统计' })
  @ApiOkResponse({ type: PaymentSummaryResponseSwagger })
  @Get('payments/summary')
  @Roles(UserRoleEnum.OS_SUPER_ADMIN)
  @Permissions(TenantPermissionCodeEnum.PAYMENTS_READ)
  async getPaymentSummary(@CurrentUser() currentUser: JwtPayload): Promise<PaymentSummaryResponse> {
    return this.paymentService.getPaymentSummary(currentUser);
  }

  // 为指定订单确认 H5 线下登记支付，收口租户财务人工确认入口
  @ApiOperation({ summary: '确认线下登记支付' })
  @ApiParam({ name: 'id', description: '订单 ID' })
  @ApiOkResponse({ type: CreateOfflinePaymentVerificationResponseSwagger })
  @Post('orders/:id/offline-payment-verifications')
  @Permissions(TenantPermissionCodeEnum.PAYMENTS_OFFLINE_PAYMENT_VERIFY_CREATE)
  async createOfflinePaymentVerification(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') orderId: string,
    @Body() request: CreateOfflinePaymentVerificationDto,
  ): Promise<CreateOfflinePaymentVerificationResponse> {
    return this.paymentService.createOfflinePaymentVerification(currentUser, orderId, request as CreateOfflinePaymentVerificationRequest);
  }
}
