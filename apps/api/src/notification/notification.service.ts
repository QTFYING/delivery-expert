import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { TenantNotificationRecordItem } from '@shou/types/contracts';
import type { PaginatedResponse } from '@shou/types/common';
import { NoticeStatusEnum, Prisma } from '@prisma/client';
import { JwtPayload } from '../auth/decorators/current-user.decorator';
import { formatDateTime } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async getNotifications(currentUser: JwtPayload, page?: number, pageSize?: number): Promise<PaginatedResponse<TenantNotificationRecordItem>> {
    const tenantId = this.getTenantId(currentUser);
    const resolvedPage = this.normalizePage(page);
    const resolvedPageSize = this.normalizePageSize(pageSize);
    const where: Prisma.NoticeWhereInput = {
      status: NoticeStatusEnum.PUBLISHED,
      publishAt: { lte: new Date() },
    };

    const [notices, total] = await Promise.all([
      this.prisma.notice.findMany({
        where,
        include: {
          reads: {
            where: {
              tenantId,
              userId: currentUser.userId,
            },
            take: 1,
          },
        },
        orderBy: [{ publishAt: 'desc' }, { createdAt: 'desc' }],
        skip: (resolvedPage - 1) * resolvedPageSize,
        take: resolvedPageSize,
      }),
      this.prisma.notice.count({ where }),
    ]);

    return {
      list: notices.map((item) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        publishAt: formatDateTime(item.publishAt ?? item.createdAt),
        isRead: item.reads.some((read) => read.isRead),
      })),
      total,
      page: resolvedPage,
      pageSize: resolvedPageSize,
    };
  }

  async markAsRead(currentUser: JwtPayload, noticeId: string): Promise<null> {
    const tenantId = this.getTenantId(currentUser);
    const notice = await this.prisma.notice.findFirst({
      where: {
        id: noticeId,
        status: NoticeStatusEnum.PUBLISHED,
        publishAt: { lte: new Date() },
      },
      select: { id: true },
    });

    if (!notice) {
      throw new NotFoundException('公告不存在');
    }

    await this.prisma.noticeRead.upsert({
      where: {
        noticeId_tenantId_userId: {
          noticeId,
          tenantId,
          userId: currentUser.userId,
        },
      },
      update: {
        isRead: true,
        readAt: new Date(),
      },
      create: {
        noticeId,
        tenantId,
        userId: currentUser.userId,
        isRead: true,
        readAt: new Date(),
      },
    });

    return null;
  }

  private normalizePage(value?: number): number {
    return value && value > 0 ? value : 1;
  }

  private normalizePageSize(value?: number): number {
    if (!value || value <= 0) return 20;
    return Math.min(value, 200);
  }

  private getTenantId(currentUser: JwtPayload): string {
    if (!currentUser.tenantId) {
      throw new BadRequestException('当前登录态不属于租户侧，无法读取公告');
    }
    return currentUser.tenantId;
  }
}
