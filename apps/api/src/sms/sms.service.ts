import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import DypnsapiClient, { SendSmsVerifyCodeRequest } from '@alicloud/dypnsapi20170525';
import { Config as OpenApiConfig } from '@alicloud/openapi-client';
import { RuntimeOptions } from '@alicloud/tea-util';
import { SmsCodeSceneEnum } from '@shou/types/enums';
import { BusinessException } from '../common/exceptions/business.exception';
import { smsConfig } from '../config/sms.config';
import type { SendSmsVerificationCodeInput, SendSmsVerificationCodeResult } from './sms.types';

const SMS_COUNTRY_CODE_CHINA = '86';
const SMS_DUPLICATE_POLICY_OVERWRITE = 1;
const SMS_INTERVAL_SECONDS = 60;
const SMS_CODE_LENGTH = 6;
const SMS_CODE_TYPE_DIGITS = 1;

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly client: DypnsapiClient | null;

  constructor(
    @Inject(smsConfig.KEY)
    private readonly smsSettings: ConfigType<typeof smsConfig>,
  ) {
    this.client = this.createClient();
  }

  /** 发送项目自生成的短信验证码；真实发送关闭时只返回 disabled 结果 */
  async sendVerificationCode(input: SendSmsVerificationCodeInput): Promise<SendSmsVerificationCodeResult> {
    if (!this.smsSettings.sendEnabled) {
      return { sent: false, provider: 'disabled', message: 'SMS_SEND_ENABLED=false' };
    }

    if (!this.client) {
      throw new BusinessException(1004, '短信服务配置不完整', 500);
    }

    const request = new SendSmsVerifyCodeRequest({
      signName: this.smsSettings.aliyunSmsSignName,
      templateCode: this.resolveTemplateCode(input.scene),
      phoneNumber: input.phone,
      countryCode: SMS_COUNTRY_CODE_CHINA,
      templateParam: JSON.stringify({ code: input.code, min: String(input.validMinutes) }),
      duplicatePolicy: SMS_DUPLICATE_POLICY_OVERWRITE,
      interval: SMS_INTERVAL_SECONDS,
      codeLength: SMS_CODE_LENGTH,
      codeType: SMS_CODE_TYPE_DIGITS,
      outId: input.outId,
      returnVerifyCode: false,
    });

    try {
      const response = await this.client.sendSmsVerifyCodeWithOptions(request, new RuntimeOptions({}));
      const body = response.body;
      if (!body?.success || body.code !== 'OK') {
        this.logger.error(`阿里云短信验证码发送失败: code=${body?.code ?? '<empty>'}, message=${body?.message ?? '<empty>'}`);
        throw new BusinessException(50002, '短信验证码发送失败', 502);
      }

      return {
        sent: true,
        provider: 'aliyun-pnvs',
        requestId: body.requestId ?? body.model?.requestId,
        bizId: body.model?.bizId,
        message: body.message,
      };
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      this.logger.error('阿里云短信验证码发送异常', error instanceof Error ? error.stack : String(error));
      throw new BusinessException(50002, '短信验证码发送失败', 502);
    }
  }

  /** 根据短信验证码场景选择阿里云模板 Code；当前登录和找回可共用系统模板 */
  private resolveTemplateCode(scene: SendSmsVerificationCodeInput['scene']): string {
    if (scene === SmsCodeSceneEnum.TENANT_PASSWORD_RESET) {
      return this.smsSettings.aliyunSmsPasswordResetTemplateCode;
    }
    return this.smsSettings.aliyunSmsLoginTemplateCode;
  }

  /** 创建 PNVS SDK 客户端；真实发送关闭时不要求 AK 存在 */
  private createClient(): DypnsapiClient | null {
    if (!this.smsSettings.aliyunAccessKeyId || !this.smsSettings.aliyunAccessKeySecret) {
      return null;
    }

    return new DypnsapiClient(
      new OpenApiConfig({
        accessKeyId: this.smsSettings.aliyunAccessKeyId,
        accessKeySecret: this.smsSettings.aliyunAccessKeySecret,
        endpoint: this.smsSettings.aliyunSmsEndpoint,
      }),
    );
  }
}
