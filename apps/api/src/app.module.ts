import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { EnvironmentModule } from './config/environment.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { TenantModule } from './tenant/tenant.module';
import { PlatformModule } from './platform/platform.module';
import { SettingsModule } from './settings/settings.module';
import { OrderModule } from './order/order.module';
import { ImportModule } from './import/import.module';
import { PaymentModule } from './payment/payment.module';
import { ReportModule } from './report/report.module';
import { NotificationModule } from './notification/notification.module';
import { FinanceModule } from './finance/finance.module';
import { IdGeneratorModule } from './id-generator/id-generator.module';
import { RequestLoggingMiddleware } from './common/middleware/request-logging.middleware';

@Module({
  imports: [
    EnvironmentModule,
    PrismaModule,
    IdGeneratorModule,
    RedisModule,
    AuthModule,
    TenantModule,
    PlatformModule,
    SettingsModule,
    OrderModule,
    ImportModule.register('api'),
    PaymentModule,
    FinanceModule,
    ReportModule,
    NotificationModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
