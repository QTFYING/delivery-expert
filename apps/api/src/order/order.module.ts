import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PaymentModule } from '../payment/payment.module';
import { OrderFinanceController } from './order-finance.controller';
import { OrderFinanceService } from './order-finance.service';
import { OrderOSQueryService } from './order-os-query.service';
import { OrderPrintController } from './order-print.controller';
import { OrderPrintQueryService } from './order-print-query.service';
import { OrderPrintService } from './order-print.service';
import { OrderTenantQueryService } from './order-tenant-query.service';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';

@Module({
  imports: [AuthorizationModule, PaymentModule],
  controllers: [OrderPrintController, OrderFinanceController, OrderController],
  providers: [OrderService, OrderOSQueryService, OrderTenantQueryService, OrderFinanceService, OrderPrintService, OrderPrintQueryService],
  exports: [OrderService, OrderFinanceService, OrderPrintService, OrderPrintQueryService],
})
export class OrderModule {}
