import { Module } from '@nestjs/common';
import { EnvironmentModule } from '../config/environment.module';
import { PrismaModule } from '../prisma/prisma.module';
import { IdGeneratorModule } from '../id-generator/id-generator.module';
import { RedisModule } from '../redis/redis.module';
import { ImportModule } from './import.module';

@Module({
  imports: [EnvironmentModule, PrismaModule, IdGeneratorModule, RedisModule, ImportModule.register('worker')],
})
export class ImportWorkerModule {}
