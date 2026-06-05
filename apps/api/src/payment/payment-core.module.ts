import { Module } from '@nestjs/common';
import { LakalaCounterService } from './gateway/lakala-counter.service';
import { LakalaGatewayProvider } from './gateway/lakala-gateway.provider';
import { PaymentGatewayRegistry } from './gateway/payment-gateway.registry';
import { PaymentInitiationService } from './payment-initiation.service';
import { PaymentLedgerService } from './payment-ledger.service';
import { PaymentOperationService } from './payment-operation.service';
import { PaymentQueryService } from './payment-query.service';
import { PaymentTenantConfigService } from './payment-tenant-config.service';
import { PaymentTenantLifecycleService } from './payment-tenant-lifecycle.service';
import { PaymentWebhookAuditService } from './payment-webhook-audit.service';
import { PaymentWebhookService } from './payment-webhook.service';
import { PaymentWindowService } from './payment-window.service';
import { PaymentService } from './payment.service';

@Module({
  imports: [],
  controllers: [],
  providers: [
    PaymentService,
    PaymentQueryService,
    PaymentTenantConfigService,
    PaymentTenantLifecycleService,
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
  exports: [
    PaymentService,
    PaymentLedgerService, // 支付账簿服务
    PaymentQueryService,
    PaymentOperationService,
    PaymentWindowService,
  ],
})
export class PaymentCoreModule {}
