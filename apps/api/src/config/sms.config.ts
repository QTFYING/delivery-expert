import { registerAs } from '@nestjs/config';

export const smsConfig = registerAs('sms', () => {
  const aliyunAccessKeyId = process.env.ALIYUN_ACCESS_KEY_ID?.trim() || '';
  const aliyunAccessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET?.trim() || '';
  const aliyunCaptchaSceneId = process.env.ALIYUN_CAPTCHA_SCENE_ID?.trim() || '';

  return {
    sendEnabled: process.env.SMS_SEND_ENABLED === 'true',
    debugCodeVisible: process.env.SMS_DEBUG_CODE_VISIBLE === 'true',
    aliyunAccessKeyId,
    aliyunAccessKeySecret,
    aliyunSmsEndpoint: process.env.ALIYUN_SMS_ENDPOINT?.trim() || 'dypnsapi.aliyuncs.com',
    aliyunSmsSignName: process.env.ALIYUN_SMS_SIGN_NAME?.trim() || '速通互联验证码',
    aliyunSmsLoginTemplateCode: process.env.ALIYUN_SMS_LOGIN_TEMPLATE_CODE?.trim() || '100001',
    aliyunSmsPasswordResetTemplateCode: process.env.ALIYUN_SMS_PASSWORD_RESET_TEMPLATE_CODE?.trim() || '100001',
    aliyunCaptchaEndpoint: process.env.ALIYUN_CAPTCHA_ENDPOINT?.trim() || 'captcha.cn-shanghai.aliyuncs.com',
    aliyunCaptchaSceneId,
    aliyunCaptchaEnabled: Boolean(aliyunCaptchaSceneId && aliyunAccessKeyId && aliyunAccessKeySecret),
  };
});
