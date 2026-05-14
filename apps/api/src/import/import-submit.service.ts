import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, OrderImportJobStatusEnum as PrismaImportJobStatusEnum } from '@prisma/client';
import type { OrderImportSubmitRequest, OrderImportSubmitResponse } from '@shou/types/contracts';
import { OrderImportConflictPolicyEnum } from '@shou/types/enums';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { ID_CONFIG } from '../id-generator/id-generator.constants';
import { IdGeneratorService } from '../id-generator/id-generator.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { getImportTenantId } from './import.access';
import { ImportJobRunnerService } from './import-job-runner.service';
import { buildImportPreviewConsumeLockKey, buildImportPreviewKey, IMPORT_PREVIEW_CONSUME_LOCK_SECONDS } from './import-preview.cache';
import { type PreviewSnapshot } from './import.types';
import { toImportJobStatus, toPrismaImportConflictPolicy } from './mapping/import.mapper';

@Injectable()
export class ImportSubmitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly idGen: IdGeneratorService,
    private readonly runner: ImportJobRunnerService,
  ) {}

  // 消费预检批次创建正式导入任务，收口提交锁、租户活动槽位和建 job 逻辑
  async submitOrderImport(currentUser: JwtPayload, request: OrderImportSubmitRequest): Promise<OrderImportSubmitResponse> {
    const tenantId = getImportTenantId(currentUser);
    const lockKey = buildImportPreviewConsumeLockKey(request.previewId);
    const lockValue = await this.redis.acquireLock(lockKey, IMPORT_PREVIEW_CONSUME_LOCK_SECONDS);
    if (!lockValue) {
      throw new BadRequestException('预检结果正在被消费，请勿重复提交');
    }

    try {
      const snapshot = await this.readPreviewSnapshot(tenantId, request.previewId);
      if (snapshot.invalidOrders.length > 0) {
        throw new BadRequestException('导入数据未通过预检，请先修正订单错误');
      }
      if (snapshot.orders.length === 0) {
        throw new BadRequestException('没有可导入的有效订单');
      }

      const tenantRevisionCheck = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { importRevision: true },
      });
      if (!tenantRevisionCheck) {
        throw new NotFoundException('租户不存在');
      }
      if (tenantRevisionCheck.importRevision !== snapshot.importRevision) {
        throw new BadRequestException('预检结果已失效，租户导入状态已更新，请重新预检');
      }

      const activeState = await this.runner.getActiveTenantImportJobState(tenantId);
      if (activeState) {
        throw new BadRequestException(this.runner.buildActiveImportJobMessage(activeState));
      }

      const conflictPolicy = request.conflictPolicy ?? OrderImportConflictPolicyEnum.SKIP;
      const jobId = await this.idGen.nextDailyId(ID_CONFIG.IMPORT_JOB.prefix, ID_CONFIG.IMPORT_JOB.digits);

      const reserved = await this.runner.reserveTenantActiveJobSlot(tenantId, jobId);
      if (!reserved) {
        const latestState = await this.runner.getActiveTenantImportJobState(tenantId);
        throw new BadRequestException(latestState ? this.runner.buildActiveImportJobMessage(latestState) : '当前租户已有导入任务进行中，请稍后再试');
      }

      let job;
      try {
        job = await this.prisma.$transaction(async (tx) => {
          const tenantUpdate = await tx.tenant.updateMany({
            where: { id: tenantId, importRevision: snapshot.importRevision },
            data: { importRevision: { increment: 1 } },
          });
          if (tenantUpdate.count === 0) {
            throw new BadRequestException('预检结果已失效，租户导入状态已更新，请重新预检');
          }

          return tx.importJob.create({
            data: {
              id: jobId,
              tenantId,
              status: PrismaImportJobStatusEnum.PENDING,
              conflictPolicy: toPrismaImportConflictPolicy(conflictPolicy),
              snapshot: snapshot as unknown as Prisma.InputJsonValue,
              submittedCount: snapshot.orders.length,
              processedCount: 0,
              successCount: 0,
              skippedCount: 0,
              overwrittenCount: 0,
              failedCount: 0,
              failedOrders: [],
              conflictDetails: [],
            },
          });
        });
      } catch (error) {
        await this.runner.clearTenantImportJobState(tenantId, jobId);
        throw error;
      }

      await this.redis.delete(buildImportPreviewKey(request.previewId));

      if (this.runner.shouldEnqueueImmediately()) {
        this.runner.enqueueJob(job.id);
      }

      return {
        jobId: job.id,
        previewId: snapshot.previewId,
        submittedCount: job.submittedCount,
        status: toImportJobStatus(job.status),
      };
    } finally {
      await this.redis.releaseLock(lockKey, lockValue).catch(() => false);
    }
  }

  // 按租户边界读取 Redis 中的预检快照，供正式提交消费 previewId
  private async readPreviewSnapshot(tenantId: string, previewId: string): Promise<PreviewSnapshot> {
    const snapshot = await this.redis.getJson<PreviewSnapshot>(buildImportPreviewKey(previewId));
    if (!snapshot) {
      throw new BadRequestException('预检结果不存在或已过期');
    }
    if (snapshot.tenantId !== tenantId) {
      throw new ForbiddenException('无权使用该预检结果');
    }
    return snapshot;
  }
}
