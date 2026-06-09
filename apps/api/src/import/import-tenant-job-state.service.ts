import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { OrderImportJobStatusEnum as PrismaImportJobStatusEnum } from '@prisma/client';
import { OrderImportJobStatusEnum, type OrderImportJobStatus } from '@shou/types/enums';
import dayjs from 'dayjs';
import { importConfig } from '../config/import.config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { buildTenantImportJobState } from './import-job-runner.helpers';
import { isTerminalImportJobStatus } from './import-job.worker.helpers';
import type { TenantImportJobState } from './import.types';
import { describeImportJobStatus, toImportJobStatus } from './mapping/import.mapper';

// 刚完成 Redis 占位但 import_job 尚未写入数据库时，允许保留的最短建单宽限窗，单位秒
const IMPORT_ACTIVE_JOB_DB_CREATE_GRACE_SECONDS = 15;

@Injectable()
export class ImportTenantJobStateService {
  private readonly logger = new Logger(ImportTenantJobStateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(importConfig.KEY)
    private readonly importSettings: ConfigType<typeof importConfig>,
  ) {}

  // 读取租户级活动导入任务状态；当 Redis 占位缺失时，会回查数据库并自愈回补
  async getActiveTenantImportJobState(tenantId: string): Promise<TenantImportJobState | null> {
    const stateKey = this.getTenantActiveImportJobKey(tenantId);
    const state = await this.redis.getJson<TenantImportJobState>(stateKey);
    if (!state) {
      return this.recoverTenantImportJobStateFromDb(tenantId);
    }

    const job = await this.prisma.importJob.findFirst({
      where: { id: state.jobId, tenantId },
      select: { status: true },
    });
    if (!job) {
      if (this.isWithinDbCreateGraceWindow(state)) {
        return state;
      }
      await this.redis.delete(stateKey);
      return this.recoverTenantImportJobStateFromDb(tenantId, state.jobId);
    }
    const jobStatus = toImportJobStatus(job.status);
    if (isTerminalImportJobStatus(jobStatus)) {
      await this.redis.delete(stateKey);
      return this.recoverTenantImportJobStateFromDb(tenantId, state.jobId);
    }

    if (jobStatus !== state.status) {
      const nextState: TenantImportJobState = { ...state, status: jobStatus, updatedAt: dayjs().valueOf() };
      await this.redis.setJson(stateKey, nextState, this.importSettings.activeJobTenantTtlSeconds);
      return nextState;
    }

    return state;
  }

  // 组装“当前已有活动导入任务”的统一提示文案
  buildActiveImportJobMessage(state: TenantImportJobState): string {
    return `当前租户已有导入任务${describeImportJobStatus(state.status)}，jobId=${state.jobId}，请通过 /orders/import/jobs/${state.jobId} 查询进度`;
  }

  // 为租户抢占正式导入活动槽位，防止同租户并发创建多个任务
  async reserveTenantActiveJobSlot(tenantId: string, jobId: string): Promise<boolean> {
    return this.tryReserveTenantActiveJobSlot(tenantId, jobId);
  }

  // 仅当当前占位里的 jobId 仍然属于该任务时，才原子清理租户级活动导入状态
  async clearTenantImportJobState(tenantId: string, jobId: string): Promise<void> {
    await this.redis.deleteJsonIfFieldMatches(this.getTenantActiveImportJobKey(tenantId), 'jobId', jobId);
  }

  // 仅当当前任务仍持有租户活动槽位时，才刷新状态并续租 TTL；槽位丢失时会按数据库现状尝试自愈回补
  async renewTenantImportJobState(tenantId: string, jobId: string, status: OrderImportJobStatus): Promise<boolean> {
    const stateKey = this.getTenantActiveImportJobKey(tenantId);
    const state = await this.redis.getJson<TenantImportJobState>(stateKey);
    if (!state) {
      return (await this.recoverTenantImportJobStateFromDb(tenantId))?.jobId === jobId;
    }
    if (state.jobId !== jobId) {
      return false;
    }

    return this.redis.setJsonIfFieldMatches(
      stateKey,
      'jobId',
      jobId,
      { ...state, status, updatedAt: dayjs().valueOf() },
      this.importSettings.activeJobTenantTtlSeconds,
    );
  }

  // 统一生成租户级活动导入任务状态 key
  private getTenantActiveImportJobKey(tenantId: string): string {
    return `import:tenant:${tenantId}:job`;
  }

  // 判断当前占位是否仍处于“刚 reserve 成功、数据库可能尚未落行”的短暂建单窗口
  private isWithinDbCreateGraceWindow(state: TenantImportJobState): boolean {
    if (state.status !== OrderImportJobStatusEnum.PENDING) {
      return false;
    }

    return dayjs().diff(dayjs(state.updatedAt), 'second', true) < IMPORT_ACTIVE_JOB_DB_CREATE_GRACE_SECONDS;
  }

  // 用最原始的 NX 占位尝试抢槽位，不负责孤儿占位清理
  private async tryReserveTenantActiveJobSlot(tenantId: string, jobId: string): Promise<boolean> {
    return this.redis.setJsonIfAbsent(
      this.getTenantActiveImportJobKey(tenantId),
      buildTenantImportJobState(jobId, OrderImportJobStatusEnum.PENDING),
      this.importSettings.activeJobTenantTtlSeconds,
    );
  }

  // 当 Redis 活动占位缺失或失真时，回查数据库中的活动任务并重建租户级状态
  private async recoverTenantImportJobStateFromDb(tenantId: string, staleJobId?: string): Promise<TenantImportJobState | null> {
    const job = await this.prisma.importJob.findFirst({
      where: { tenantId, status: { in: [PrismaImportJobStatusEnum.PENDING, PrismaImportJobStatusEnum.PROCESSING] } },
      select: { id: true, status: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!job) {
      if (staleJobId) {
        this.logger.warn(`租户活动导入孤儿占位已清理，tenantId=${tenantId}, staleJobId=${staleJobId}`);
      }
      return null;
    }

    const state = buildTenantImportJobState(job.id, toImportJobStatus(job.status));
    state.createdAt = dayjs(job.createdAt).valueOf();
    state.updatedAt = dayjs(job.updatedAt).valueOf();
    await this.redis.setJson(this.getTenantActiveImportJobKey(tenantId), state, this.importSettings.activeJobTenantTtlSeconds);
    this.logger.warn(
      staleJobId
        ? `租户活动导入占位已失效，已根据数据库回补，tenantId=${tenantId}, staleJobId=${staleJobId}, restoredJobId=${job.id}`
        : `租户活动导入占位缺失，已根据数据库回补，tenantId=${tenantId}, restoredJobId=${job.id}`,
    );
    return state;
  }
}
