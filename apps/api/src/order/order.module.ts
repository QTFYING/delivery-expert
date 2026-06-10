import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PaymentCoreModule } from '../payment/payment-core.module';
import { OrderFinanceController } from './order-finance.controller';
import { OrderFinanceService } from './order-finance.service';
import { OrderExportService } from './order-export.service';
import { OrderOSQueryService } from './order-os-query.service';
import { OrderPrintController } from './order-print.controller';
import { OrderPrintQueryService } from './order-print-query.service';
import { OrderPrintService } from './order-print.service';
import { OrderTenantQueryService } from './order-tenant-query.service';
import { PrintingController } from './printing.controller';
import { PrintingOrderQueryService } from './printing-order-query.service';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';

@Module({
  imports: [AuthorizationModule, PaymentCoreModule],
  controllers: [PrintingController, OrderPrintController, OrderFinanceController, OrderController],
  providers: [OrderService, OrderOSQueryService, OrderTenantQueryService, OrderExportService, OrderFinanceService, OrderPrintService, OrderPrintQueryService, PrintingOrderQueryService],
  exports: [OrderService, OrderFinanceService, OrderPrintService, OrderPrintQueryService, PrintingOrderQueryService],
})
export class OrderModule {}
