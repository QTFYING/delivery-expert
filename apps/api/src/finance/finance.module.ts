import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AdminReconciliationController, TenantFinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [AuthorizationModule],
  controllers: [TenantFinanceController, AdminReconciliationController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
