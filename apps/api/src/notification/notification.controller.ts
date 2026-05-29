import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { TenantNotificationRecordItem } from '@shou/types/contracts';
import type { PaginatedResponse } from '@shou/types/common';
import { TenantPermissionCodeEnum } from '@shou/types/enums';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../authorization/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { ListNotificationsQueryDto } from './dto/list-notifications.query.dto';
import { NotificationService } from './notification.service';
import { NotificationListResponseSwagger, TenantNotificationRecordItemSwagger } from './notification.swagger';

@ApiTags('Notifications')
@ApiBearerAuth()
@ApiExtraModels(NotificationListResponseSwagger, TenantNotificationRecordItemSwagger)
@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @ApiOperation({ summary: '获取平台公告列表' })
  @ApiOkResponse({ type: NotificationListResponseSwagger })
  @Get()
  @Permissions(TenantPermissionCodeEnum.NOTIFICATIONS_READ)
  async getNotifications(
    @CurrentUser() currentUser: JwtPayload,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<PaginatedResponse<TenantNotificationRecordItem>> {
    return this.notificationService.getNotifications(currentUser, query.page, query.pageSize);
  }

  @ApiOperation({ summary: '标记公告已读' })
  @ApiParam({ name: 'id', description: '公告 ID' })
  @ApiOkResponse({ description: '标记成功', schema: { type: 'null' } })
  @Post(':id/read-records')
  @Permissions(TenantPermissionCodeEnum.NOTIFICATIONS_MANAGE)
  async markAsRead(@CurrentUser() currentUser: JwtPayload, @Param('id') noticeId: string): Promise<null> {
    return this.notificationService.markAsRead(currentUser, noticeId);
  }
}
