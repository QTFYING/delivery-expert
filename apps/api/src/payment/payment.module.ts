import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { LakalaGatewayProvider } from './gateway/lakala-gateway.provider';
import { LakalaCounterService } from './gateway/lakala-counter.service';
import { PaymentGatewayRegistry } from './gateway/payment-gateway.registry';
import { PaymentInitiationService } from './payment-initiation.service';
import { PaymentLedgerService } from './payment-ledger.service';
import { PaymentOperationService } from './payment-operation.service';
import { PaymentQueryService } from './payment-query.service';
import { PaymentService } from './payment.service';
import { PaymentTenantConfigService } from './payment-tenant-config.service';
import { PaymentWindowService } from './payment-window.service';
import { PaymentWebhookAuditService } from './payment-webhook-audit.service';
import { PaymentWebhookService } from './payment-webhook.service';
import { H5PaymentController } from './payment-h5.controller';
import { TenantPaymentController } from './payment-tenant.controller';
import { PaymentWebhookController } from './payment-webhook.controller';

@Module({
  imports: [AuthorizationModule],
  controllers: [H5PaymentController, PaymentWebhookController, TenantPaymentController],
  providers: [
    PaymentService,
    PaymentQueryService,
    PaymentTenantConfigService,
    PaymentWindowService,
    PaymentOperationService,
    PaymentInitiationService,
    PaymentWebhookService,
    PaymentWebhookAuditService,
    PaymentLedgerService,
    PaymentGatewayRegistry,
    LakalaGatewayProvider,
    LakalaCounterService,
  ],
  exports: [PaymentService, PaymentLedgerService],
})
export class PaymentModule {}
