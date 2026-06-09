import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { UploadModule } from '../upload/upload.module';
import { PrintingTemplatePackageAdminController } from './printing-template-package-admin.controller';
import { PrintingTemplatePackageTenantController } from './printing-template-package-tenant.controller';
import { PrintingTemplatePackageService } from './printing-template-package.service';

@Module({
  imports: [AuthorizationModule, UploadModule],
  controllers: [PrintingTemplatePackageTenantController, PrintingTemplatePackageAdminController],
  providers: [PrintingTemplatePackageService],
  exports: [PrintingTemplatePackageService],
})
export class PrintingTemplatePackageModule {}
