import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthorizationModule } from '../authorization/authorization.module';
import { authConfig } from '../config/auth.config';
import { SmsModule } from '../sms/sms.module';
import { AuthController } from './auth.controller';
import { AuthSmsService } from './auth-sms.service';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    AuthorizationModule,
    SmsModule,
    JwtModule.registerAsync({
      inject: [authConfig.KEY],
      useFactory: (settings: ConfigType<typeof authConfig>) => ({
        secret: settings.jwtSecret,
        signOptions: { expiresIn: settings.accessTokenTtlSeconds },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthSmsService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
