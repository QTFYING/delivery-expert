import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsPrintingService } from './settings-printing.service';
import { SettingsPaymentConfigService } from './settings-payment-config.service';
import { SettingsUserPasswordService } from './settings-user-password.service';
import { SettingsRoleService } from './settings-role.service';
import { SettingsUserService } from './settings-user.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [AuthorizationModule],
  controllers: [SettingsController],
  providers: [
    SettingsService,
    SettingsRoleService,
    SettingsUserService,
    SettingsUserPasswordService,
    SettingsPrintingService,
    SettingsPaymentConfigService,
  ],
  exports: [SettingsPaymentConfigService],
})
export class SettingsModule {}
