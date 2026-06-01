import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import CaptchaClient, { VerifyIntelligentCaptchaRequest } from '@alicloud/captcha20230305';
import { Config as OpenApiConfig } from '@alicloud/openapi-client';
import { RuntimeOptions } from '@alicloud/tea-util';
import { BusinessException } from '../common/exceptions/business.exception';
import { smsConfig } from '../config/sms.config';
import type { VerifyCaptchaInput, VerifyCaptchaResult } from './sms.types';

@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);
  private readonly client: CaptchaClient | null;

  constructor(
    @Inject(smsConfig.KEY)
    private readonly smsSettings: ConfigType<typeof smsConfig>,
  ) {
    this.client = this.createClient();
  }

  /** 配置完整时校验阿里云验证码 2.0；未配置时返回未启用结果 */
  async verifyIntelligentCaptcha(input: VerifyCaptchaInput): Promise<VerifyCaptchaResult> {
    if (!this.smsSettings.aliyunCaptchaEnabled) {
      return { enabled: false, verified: true, message: 'captcha disabled' };
    }

    if (!input.captchaVerifyParam?.trim()) {
      throw new BusinessException(4022, '请先完成滑块验证', 422);
    }
    if (!this.client) {
      throw new BusinessException(1004, '验证码服务配置不完整', 500);
    }

    try {
      const response = await this.client.verifyIntelligentCaptchaWithOptions(
        new VerifyIntelligentCaptchaRequest({
          sceneId: this.smsSettings.aliyunCaptchaSceneId,
          captchaVerifyParam: input.captchaVerifyParam,
        }),
        new RuntimeOptions({}),
      );
      const body = response.body;
      const verified = Boolean(body?.success && body.result?.verifyResult);
      if (!verified) {
        return { enabled: true, verified: false, requestId: body?.requestId, message: body?.message };
      }

      return { enabled: true, verified: true, requestId: body?.requestId, message: body?.message };
    } catch (error) {
      this.logger.error('阿里云验证码 2.0 校验异常', error instanceof Error ? error.stack : String(error));
      throw new BusinessException(50003, '滑块验证失败', 502);
    }
  }

  /** 创建验证码 2.0 SDK 客户端；未配置 SceneId 时不启用校验 */
  private createClient(): CaptchaClient | null {
    if (!this.smsSettings.aliyunCaptchaEnabled || !this.smsSettings.aliyunAccessKeyId || !this.smsSettings.aliyunAccessKeySecret) {
      return null;
    }

    return new CaptchaClient(
      new OpenApiConfig({
        accessKeyId: this.smsSettings.aliyunAccessKeyId,
        accessKeySecret: this.smsSettings.aliyunAccessKeySecret,
        endpoint: this.smsSettings.aliyunCaptchaEndpoint,
      }),
    );
  }
}
