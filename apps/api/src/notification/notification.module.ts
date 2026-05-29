import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';

@Module({
  imports: [AuthorizationModule],
  controllers: [NotificationController],
  providers: [NotificationService],
})
export class NotificationModule {}
