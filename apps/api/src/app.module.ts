import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { buildPinoLoggerOptions } from './common/logger/pino-logger.options';
import { RequestLoggingMiddleware } from './common/middleware/request-logging.middleware';
import { EnvironmentModule } from './config/environment.module';
import { FinanceModule } from './finance/finance.module';
import { IdGeneratorModule } from './id-generator/id-generator.module';
import { ImportModule } from './import/import.module';
import { NotificationModule } from './notification/notification.module';
import { OrderModule } from './order/order.module';
import { PaymentModule } from './payment/payment.module';
import { PlatformModule } from './platform/platform.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { ReportModule } from './report/report.module';
import { SettingsModule } from './settings/settings.module';
import { SmsModule } from './sms/sms.module';
import { TenantModule } from './tenant/tenant.module';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [
    LoggerModule.forRoot(buildPinoLoggerOptions()),
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
    UploadModule,
    SmsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  /** 注册全局请求日志中间件，覆盖 API 进程内的所有 HTTP 路由 */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
