import { Module } from '@nestjs/common';
import { CaptchaService } from './captcha.service';
import { SmsCodeStore } from './sms-code.store';
import { SmsService } from './sms.service';

@Module({
  providers: [SmsService, CaptchaService, SmsCodeStore],
  exports: [SmsService, CaptchaService, SmsCodeStore],
})
export class SmsModule {}
