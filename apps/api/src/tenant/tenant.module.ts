import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { OsTenantCertificationController } from './os-tenant-certification.controller';
import { OsTenantCertificationService } from './os-tenant-certification.service';
import { OsTenantController } from './os-tenant.controller';
import { OsTenantLifecycleService } from './os-tenant-lifecycle.service';
import { OsTenantPaymentConfigService } from './os-tenant-payment-config.service';
import { OsTenantQueryService } from './os-tenant-query.service';
import { OsUserController } from './os-user.controller';
import { OsUserService } from './os-user.service';
import { TenantCertificationController } from './tenant-certification.controller';
import { TenantCertificationService } from './tenant-certification.service';
import { TenantSelfController } from './tenant-self.controller';
import { TenantService } from './tenant.service';

@Module({
  imports: [SettingsModule],
  controllers: [TenantSelfController, OsTenantController, OsTenantCertificationController, OsUserController, TenantCertificationController],
  providers: [
    TenantService,
    TenantCertificationService,
    OsTenantCertificationService,
    OsUserService,
    OsTenantLifecycleService,
    OsTenantQueryService,
    OsTenantPaymentConfigService,
  ],
  exports: [
    TenantService,
    TenantCertificationService,
    OsTenantCertificationService,
    OsUserService,
    OsTenantLifecycleService,
    OsTenantQueryService,
    OsTenantPaymentConfigService,
  ],
})
export class TenantModule {}
