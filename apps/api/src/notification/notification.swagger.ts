import { ApiProperty } from '@nestjs/swagger';
import type { TenantNotificationRecordItem as TenantNotificationRecordItemContract } from '@shou/types/contracts';
import type { PaginatedResponse } from '@shou/types/common';
import { PaginatedResponseMetaSwagger } from '../common/swagger/paginated-response.swagger';

export class TenantNotificationRecordItemSwagger implements TenantNotificationRecordItemContract {
  @ApiProperty({ description: '公告 ID' })
  id!: string;

  @ApiProperty({ description: '公告标题', example: '清明节放假通知' })
  title!: string;

  @ApiProperty({ description: '公告正文', example: '平台将在节假日期间安排值班支持。' })
  content!: string;

  @ApiProperty({ description: '发布时间', example: '2026-04-11T09:00:00.000Z' })
  publishAt!: string;

  @ApiProperty({ description: '是否已读', example: false })
  isRead!: boolean;
}

export class NotificationListResponseSwagger extends PaginatedResponseMetaSwagger implements PaginatedResponse<TenantNotificationRecordItemContract> {
  @ApiProperty({ description: '公告列表', type: [TenantNotificationRecordItemSwagger] })
  list!: TenantNotificationRecordItemSwagger[];
}
