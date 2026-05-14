import { Module } from '@nestjs/common';
import { AdminReconciliationController, TenantFinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  controllers: [TenantFinanceController, AdminReconciliationController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
