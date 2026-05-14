import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class LakalaWebhookDto {
  // 渠道标识
  @ApiProperty({ description: '渠道 ID', required: false })
  @IsOptional()
  channel_id?: string;

  // 拉卡拉商户号
  @ApiProperty({ description: '商户号', required: false })
  @IsOptional()
  merchant_no?: string;

  // 订单创建时间
  @ApiProperty({ description: '订单创建时间', required: false, example: '20260428141504' })
  @IsOptional()
  order_create_time?: string;

  // 订单失效时间
  @ApiProperty({ description: '订单失效时间', required: false, example: '20260428142004' })
  @IsOptional()
  order_efficient_time?: string;

  // 拉卡拉侧保存的订单附加信息
  @ApiProperty({ description: '订单信息', required: false })
  @IsOptional()
  order_info?: string;

  // 根级订单状态
  @ApiProperty({ description: '根级订单状态', required: false, example: '2' })
  @IsOptional()
  order_status?: string;

  // 我方商户单号，对应本地 gatewayTradeNo
  @ApiProperty({ description: '我方商户单号', required: false })
  @IsOptional()
  out_order_no?: string;

  // 拉卡拉支付订单号
  @ApiProperty({ description: '拉卡拉支付订单号', required: false })
  @IsOptional()
  pay_order_no?: string;

  // 受理终端号
  @ApiProperty({ description: '终端号', required: false })
  @IsOptional()
  term_no?: string;

  // 订单金额，单位分
  @ApiProperty({ description: '订单金额（分）', required: false, example: 1 })
  @IsOptional()
  total_amount?: string | number;

  // 交易商户号
  @ApiProperty({ description: '交易商户号', required: false })
  @IsOptional()
  trans_merchant_no?: string;

  // 交易终端号
  @ApiProperty({ description: '交易终端号', required: false })
  @IsOptional()
  trans_term_no?: string;

  // 渠道失败或提示文案
  @ApiProperty({ description: '渠道返回信息', required: false })
  @IsOptional()
  channel_ret_msg?: string;

  // 通用消息文案
  @ApiProperty({ description: '消息', required: false })
  @IsOptional()
  message?: string;

  // 订单交易明细，当前真实成功回调的核心交易字段都在这里
  @ApiProperty({ description: '订单交易详情', required: false, type: Object, additionalProperties: true })
  @IsOptional()
  order_trade_info?: Record<string, unknown> | string;
}
