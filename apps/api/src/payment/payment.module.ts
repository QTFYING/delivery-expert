import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PaymentCoreModule } from './payment-core.module';
import { H5PaymentController } from './payment-h5.controller';
import { TenantPaymentController } from './payment-tenant.controller';
import { PaymentWebhookController } from './payment-webhook.controller';

@Module({
  imports: [AuthorizationModule, PaymentCoreModule],
  controllers: [H5PaymentController, PaymentWebhookController, TenantPaymentController],
})
export class PaymentModule {}
