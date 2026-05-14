import { Global, Module } from '@nestjs/common';
import { AuthSessionStore } from './auth-session.store';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService, AuthSessionStore],
  exports: [RedisService, AuthSessionStore],
})
export class RedisModule {}
