import { Module } from '@nestjs/common';
import { SettingsPrintingService } from './settings-printing.service';
import { SettingsPaymentConfigService } from './settings-payment-config.service';
import { SettingsUserPasswordService } from './settings-user-password.service';
import { SettingsUserService } from './settings-user.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController],
  providers: [SettingsService, SettingsUserService, SettingsUserPasswordService, SettingsPrintingService, SettingsPaymentConfigService],
  exports: [SettingsPaymentConfigService],
})
export class SettingsModule {}
