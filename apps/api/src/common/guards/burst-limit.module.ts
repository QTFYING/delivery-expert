import { Global, Module } from '@nestjs/common';
import { RedisModule } from '../../redis/redis.module';
import { BurstLimitGuard } from './burst-limit.guard';

@Global()
@Module({
  imports: [RedisModule],
  providers: [BurstLimitGuard],
  exports: [BurstLimitGuard],
})
export class BurstLimitModule {}
