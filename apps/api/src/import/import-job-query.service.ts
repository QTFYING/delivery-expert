import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OrderImportJobResponse } from '@shou/types/contracts';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { getImportTenantId } from './import.access';
import { type PreviewSnapshot } from './import.types';
import { asConflictDetails, asJobFailures, toImportJobStatus } from './mapping/import.mapper';

@Injectable()
export class ImportJobQueryService {
  constructor(private readonly prisma: PrismaService) {}

  // 查询当前租户可见的导入任务进度，并投影为共享 contract
  async getImportJob(currentUser: JwtPayload, jobId: string): Promise<OrderImportJobResponse> {
    const tenantId = getImportTenantId(currentUser);
    const job = await this.prisma.importJob.findFirst({
      where: { id: jobId, tenantId },
    });

    if (!job) {
      throw new NotFoundException('未找到对应的导入任务');
    }

    const snapshot = this.asPreviewSnapshot(job.snapshot);
    if (!snapshot) {
      throw new NotFoundException('导入任务缺少可读快照');
    }

    return {
      jobId: job.id,
      previewId: snapshot.previewId,
      status: toImportJobStatus(job.status),
      submittedCount: job.submittedCount,
      processedCount: job.processedCount,
      successCount: job.successCount,
      skippedCount: job.skippedCount,
      overwrittenCount: job.overwrittenCount,
      failedCount: job.failedCount,
      failedOrders: asJobFailures(job.failedOrders),
      conflictDetails: asConflictDetails(job.conflictDetails),
      completedAt: job.completedAt?.toISOString(),
    };
  }

  // 将 importJob.snapshot 的 JSON 读回为内部预检快照结构
  private asPreviewSnapshot(value: Prisma.JsonValue | null): PreviewSnapshot | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as unknown as PreviewSnapshot) : null;
  }
}
