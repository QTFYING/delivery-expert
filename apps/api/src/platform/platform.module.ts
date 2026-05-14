import { Module } from '@nestjs/common';
import { PlatformOverviewService } from './platform-overview.service';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  controllers: [PlatformController],
  providers: [PlatformService, PlatformOverviewService],
  exports: [PlatformService, PlatformOverviewService],
})
export class PlatformModule {}
