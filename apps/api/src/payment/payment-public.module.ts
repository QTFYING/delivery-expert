import { Module } from '@nestjs/common';
import { EnvironmentModule } from '../config/environment.module';
import { IdGeneratorModule } from '../id-generator/id-generator.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { PaymentCoreModule } from './payment-core.module';
import { H5PaymentController } from './payment-h5.controller';
import { PaymentWebhookController } from './payment-webhook.controller';

@Module({
  imports: [EnvironmentModule, PrismaModule, RedisModule, IdGeneratorModule, PaymentCoreModule],
  controllers: [H5PaymentController, PaymentWebhookController],
})
export class PaymentPublicModule {}
