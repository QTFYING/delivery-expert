import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from './app.config';
import { authConfig } from './auth.config';
import { importConfig } from './import.config';
import { paymentConfig } from './payment.config';
import { redisConfig } from './redis.config';
import { validateEnv } from './env.validation';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      envFilePath: ['.env.local', '.env'],
      load: [appConfig, authConfig, redisConfig, paymentConfig, importConfig],
      validate: validateEnv,
    }),
  ],
  exports: [ConfigModule],
})
export class EnvironmentModule {}
