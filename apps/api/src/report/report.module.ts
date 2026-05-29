import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';

@Module({
  imports: [AuthorizationModule],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportModule {}
