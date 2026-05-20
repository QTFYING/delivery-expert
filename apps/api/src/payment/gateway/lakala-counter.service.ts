import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { BusinessException } from '../../common/exceptions/business.exception';
import { paymentConfig } from '../../config/payment.config';
import { generateLakalaAuthorization, parseLakalaJsonResponse, readLakalaString } from './lakala.adapter';

const LAKALA_COUNTER_CREATE_TIMEOUT_MS = 8_000;
const LAKALA_COUNTER_ORDER_EXPIRE_MINUTES = 5;
const LAKALA_SUPPORT_REPEAT_PAY = 1;
const LAKALA_TIMEZONE = 'Asia/Shanghai';
const LAKALA_MERCHANT_CONFIG_ERROR_PATTERNS = [
  '商户不存在',
  '商户号不存在',
  '商户未开通',
  '商户状态异常',
  '商户权限不足',
  '商户无权限',
  '商户资质',
  '商户未审核',
  '商户未通过',
  '商户未入网',
  '未开通该产品',
  '未开通此产品',
  '未开通支付',
  '无接口权限',
];
const LAKALA_TERMINAL_ERROR_PATTERNS = ['终端', 'term_no', 'termNo', 'terminal'];

dayjs.extend(utc);
dayjs.extend(timezone);

export type LakalaCounterPaymentResult = {
  cashierUrl: string;
  cashierExpiresAt: Date;
};

@Injectable()
export class LakalaCounterService {
  private readonly logger = new Logger(LakalaCounterService.name);

  constructor(
    @Inject(paymentConfig.KEY)
    private readonly paymentSettings: ConfigType<typeof paymentConfig>,
  ) {}

  /**
   * 调用拉卡拉聚合收银台建单接口，并返回前端应跳转的 `counter_url`。
   * 该调用带硬超时控制，避免第三方网络抖动无限拖住本地支付发起流程。
   */
  async requestCashierUrl(
    orderId: string,
    orderDescription: string,
    gatewayTradeNo: string,
    payableAmount: { toNumber(): number },
    config: Record<string, unknown>,
  ): Promise<LakalaCounterPaymentResult> {
    const cashierExpiresAt = dayjs().add(LAKALA_COUNTER_ORDER_EXPIRE_MINUTES, 'minute').toDate();
    const requestBody = this.buildCounterCreateRequestBody(orderId, orderDescription, gatewayTradeNo, payableAmount, cashierExpiresAt, config);
    const authorization = generateLakalaAuthorization(this.paymentSettings, requestBody);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LAKALA_COUNTER_CREATE_TIMEOUT_MS);

    try {
      const response = await fetch(this.paymentSettings.lakalaCounterCreateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: authorization,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      const responseText = await response.text();

      if (!response.ok) {
        this.logger.error(`拉卡拉收银台建单请求失败: status=${response.status}, body=${responseText || '<empty>'}`);
        this.throwIfMerchantConfigError(responseText);
        throw new BusinessException(50001, '拉卡拉收银台建单请求失败', 500);
      }

      return {
        cashierUrl: this.readCashierUrlFromResponse(responseText),
        cashierExpiresAt,
      };
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.error(`拉卡拉收银台建单请求超时: timeoutMs=${LAKALA_COUNTER_CREATE_TIMEOUT_MS}`);
        throw new BusinessException(50001, '拉卡拉收银台建单请求超时', 504);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 组装聚合收银台建单请求。
   * 这里不传旧预下单里的 `account_type=ALIPAY`，避免把用户固定限制到单一支付渠道。
   */
  private buildCounterCreateRequestBody(
    orderId: string,
    orderDescription: string,
    gatewayTradeNo: string,
    payableAmount: { toNumber(): number },
    cashierExpiresAt: Date,
    config: Record<string, unknown>,
  ) {
    const merchantNo = this.readLakalaMerchantNo(config);

    return {
      req_time: this.formatLakalaTime(new Date()),
      version: '3.0',
      req_data: {
        merchant_no: merchantNo,
        out_order_no: gatewayTradeNo,
        total_amount: Math.round(payableAmount.toNumber() * 100),
        order_efficient_time: this.formatLakalaTime(cashierExpiresAt),
        notify_url: this.paymentSettings.lakalaNotifyUrl,
        support_repeat_pay: LAKALA_SUPPORT_REPEAT_PAY,
        order_info: `订单号：${orderId}，描述：${orderDescription}`,
      },
    };
  }

  /** 拉卡拉紧凑时间字段不带时区，统一按北京时间输出，避免 Docker 镜像时区差异导致立即过期 */
  private formatLakalaTime(value: Date): string {
    return dayjs(value).tz(LAKALA_TIMEZONE).format('YYYYMMDDHHmmss');
  }

  /** 从租户渠道配置中读取拉卡拉商户号，避免继续依赖全局 env 商户号 */
  private readLakalaMerchantNo(config: Record<string, unknown>): string {
    const merchantNo = typeof config.merchantNo === 'string' ? config.merchantNo.trim() : '';
    if (!merchantNo) {
      throw new BusinessException(1004, '当前商户拉卡拉配置缺少商户号，请联系管理员', 409);
    }

    return merchantNo;
  }

  /**
   * 从拉卡拉建单响应里读取可跳转的收银台地址。
   * 当前只消费已跑通建单响应中的核心 URL 字段，不在这里扩展回调报文字段兼容。
   */
  private readCashierUrlFromResponse(responseText: string): string {
    const responseData = parseLakalaJsonResponse(responseText);
    const respData =
      typeof responseData.resp_data === 'object' && responseData.resp_data !== null ? (responseData.resp_data as Record<string, unknown>) : undefined;
    const accRespFields =
      respData && typeof respData.acc_resp_fields === 'object' && respData.acc_resp_fields !== null
        ? (respData.acc_resp_fields as Record<string, unknown>)
        : undefined;
    const responseCode = readLakalaString(responseData.resp_code) ?? readLakalaString(responseData.code);
    const cashierUrl =
      readLakalaString(respData?.counter_url) ??
      readLakalaString(respData?.pay_url) ??
      readLakalaString(accRespFields?.redirect_url) ??
      readLakalaString(accRespFields?.code);

    if (!['000000', 'BBS00000'].includes(responseCode ?? '') || !cashierUrl) {
      this.logger.error(`拉卡拉收银台建单返回异常: ${responseText || '<empty>'}`);
      this.throwIfMerchantConfigError(responseText);
      throw new BusinessException(50001, '拉卡拉收银台建单未返回有效收银台地址', 500);
    }

    return cashierUrl;
  }

  /** 仅把明确商户资质或权限类错误转成配置无效，终端类错误不影响 H5 聚合收银台 */
  private throwIfMerchantConfigError(responseText: string): void {
    if (!responseText) return;
    if (LAKALA_TERMINAL_ERROR_PATTERNS.some((pattern) => responseText.includes(pattern))) return;
    if (!LAKALA_MERCHANT_CONFIG_ERROR_PATTERNS.some((pattern) => responseText.includes(pattern))) return;

    throw new BusinessException(1004, '当前商户拉卡拉配置不可用，请联系管理员', 409);
  }
}
