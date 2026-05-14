import { Body, Controller, Get, Header, Param, Post } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type {
  InitiatePaymentResponse,
  PaymentOrderDetailResponse,
  PaymentStatusResponse,
  SubmitOfflinePaymentRequest,
  SubmitOfflinePaymentResponse,
} from '@shou/types/contracts';
import { SubmitOfflinePaymentDto } from './dto/submit-offline-payment.dto';
import { PaymentService } from './payment.service';
import {
  InitiatePaymentResponseSwagger,
  PaymentOrderDetailResponseSwagger,
  PaymentActionSwagger,
  PaymentStatusResponseSwagger,
  SubmitOfflinePaymentResponseSwagger,
} from './payment.swagger';

@ApiTags('H5 Payment')
@ApiExtraModels(
  PaymentOrderDetailResponseSwagger,
  PaymentActionSwagger,
  InitiatePaymentResponseSwagger,
  SubmitOfflinePaymentResponseSwagger,
  PaymentStatusResponseSwagger,
)
@Controller('pay')
export class H5PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // 获取 H5 公开订单详情，供支付页初始化展示订单信息
  @ApiOperation({ summary: '获取订单公开详情' })
  @ApiParam({
    name: 'token',
    description: '订单 H5 入口令牌，业务语义等同 h5EntryToken，当前实现字段为 orders.qrCodeToken',
  })
  @ApiOkResponse({ type: PaymentOrderDetailResponseSwagger })
  @Get(':token')
  async getPaymentDetail(@Param('token') token: string): Promise<PaymentOrderDetailResponse> {
    return this.paymentService.getPaymentDetail(token);
  }

  // 发起在线支付，返回当前订单对应的收银台跳转信息
  @ApiOperation({ summary: '发起在线支付' })
  @ApiParam({
    name: 'token',
    description: '订单 H5 入口令牌，业务语义等同 h5EntryToken，当前实现字段为 orders.qrCodeToken',
  })
  @ApiOkResponse({ type: InitiatePaymentResponseSwagger })
  @Post(':token/initiate')
  async initiatePayment(@Param('token') token: string): Promise<InitiatePaymentResponse> {
    return this.paymentService.initiatePayment(token);
  }

  // 提交线下支付登记信息，供后续财务核销或确认到账
  @ApiOperation({ summary: '提交线下支付信息' })
  @ApiParam({
    name: 'token',
    description: '订单 H5 入口令牌，业务语义等同 h5EntryToken，当前实现字段为 orders.qrCodeToken',
  })
  @ApiOkResponse({ type: SubmitOfflinePaymentResponseSwagger })
  @Post(':token/offline-payment')
  async submitOfflinePayment(@Param('token') token: string, @Body() request: SubmitOfflinePaymentDto): Promise<SubmitOfflinePaymentResponse> {
    return this.paymentService.submitOfflinePayment(token, request as SubmitOfflinePaymentRequest);
  }

  // 查询订单在 H5 页面当前应展示的综合收款状态
  @ApiOperation({ summary: '查询订单当前 H5 收款状态' })
  @ApiParam({
    name: 'token',
    description: '订单 H5 入口令牌，业务语义等同 h5EntryToken，当前实现字段为 orders.qrCodeToken；用于定位订单，不代表某次支付尝试',
  })
  @ApiOkResponse({
    type: PaymentStatusResponseSwagger,
    description: '返回订单当前在 H5 页面应展示的收款状态，而不是某一条支付单的原始状态直传',
  })
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @Get(':token/status')
  async getPaymentStatus(@Param('token') token: string): Promise<PaymentStatusResponse> {
    return this.paymentService.getPaymentStatus(token);
  }
}
