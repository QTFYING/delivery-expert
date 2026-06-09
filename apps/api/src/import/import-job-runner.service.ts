import { HttpException, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { OrderImportJobStatusEnum as PrismaImportJobStatusEnum, type Prisma } from '@prisma/client';
import { OrderImportConflictPolicyEnum, OrderImportJobStatusEnum } from '@shou/types/enums';
import dayjs from 'dayjs';
import { cut } from '../common/validators';
import { importConfig } from '../config/import.config';
import { ID_CONFIG } from '../id-generator/id-generator.constants';
import { IdGeneratorService } from '../id-generator/id-generator.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ImportTenantJobStateService } from './import-tenant-job-state.service';
import {
  findExistingImportOrder,
  hasSettledImportOrderFlow,
  toImportOrderCreateInput,
  toImportOrderUpdateInput,
} from './import-job-order.persistence';
import {
  asPreviewSnapshot,
  buildImportJobLockKey,
  nextProgressForFailure,
  nextProgressForOutcome,
  readImportJobProgress,
  resolveFinalStatus,
  toImportJobProgressUpdate,
  type ImportConflictPolicy,
} from './import-job-runner.helpers';
import { isTerminalImportJobStatus, shouldStartImportJobImmediately } from './import-job.worker.helpers';
import { IMPORT_RUNTIME_MODE, type ImportRuntimeMode } from './import.constants';
import type { PreparedImportOrder } from './import.normalizer';
import { type ImportJobProgress, type ImportOrderOutcome, type PreviewSnapshot, type TenantImportJobState } from './import.types';
import { toImportConflictPolicy, toImportJobStatus, toPrismaImportJobStatus } from './mapping/import.mapper';

// Worker 轮询待执行导入任务的时间间隔，单位毫秒
const IMPORT_JOB_POLL_INTERVAL_MS = 5000;
// 任务在该秒数内没有刷新心跳时，会被判定为失联可重试
const IMPORT_JOB_STALE_SECONDS = 120;
// 单个导入任务运行时的互斥锁 TTL，避免多个 worker 同时处理同一任务
const IMPORT_JOB_LOCK_TTL_SECONDS = 150;

@Injectable()
export class ImportJobRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImportJobRunnerService.name);
  private readonly queuedJobIds = new Set<string>();
  private jobPollingTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly idGen: IdGeneratorService,
    private readonly tenantJobState: ImportTenantJobStateService,
    @Inject(importConfig.KEY)
    private readonly importSettings: ConfigType<typeof importConfig>,
    @Inject(IMPORT_RUNTIME_MODE)
    private readonly runtimeMode: ImportRuntimeMode,
  ) {}

  // 模块初始化时按运行模式决定是否启动导入任务轮询
  onModuleInit(): void {
    if (this.runtimeMode === 'worker' || this.importSettings.workerEnabled) {
      this.startPolling();
    }
  }

  // 模块销毁时停止轮询，避免开发态和测试态残留定时器
  onModuleDestroy(): void {
    this.stopPolling();
  }

  // 启动导入任务轮询器，并先立即拉起一次待执行任务扫描
  startPolling(): void {
    void this.pollRunnableImportJobs().catch((error) => {
      this.logger.error('导入任务轮询初始化失败', error instanceof Error ? error.stack : undefined);
    });
    this.jobPollingTimer = setInterval(() => {
      void this.pollRunnableImportJobs().catch((error) => {
        this.logger.error('导入任务轮询失败', error instanceof Error ? error.stack : undefined);
      });
    }, IMPORT_JOB_POLL_INTERVAL_MS);
  }

  // 停止导入任务轮询器
  stopPolling(): void {
    if (this.jobPollingTimer) {
      clearInterval(this.jobPollingTimer);
      this.jobPollingTimer = undefined;
    }
  }

  // 将导入任务加入当前进程的异步执行队列，避免重复入队
  enqueueJob(jobId: string): void {
    if (this.queuedJobIds.has(jobId)) return;

    this.queuedJobIds.add(jobId);
    setImmediate(() => {
      void this.runQueuedImportJob(jobId).finally(() => {
        this.queuedJobIds.delete(jobId);
      });
    });
  }

  // 读取租户级活动导入任务状态；当 Redis 占位缺失时，会回查数据库并自愈回补
  async getActiveTenantImportJobState(tenantId: string): Promise<TenantImportJobState | null> {
    return this.tenantJobState.getActiveTenantImportJobState(tenantId);
  }

  // 组装“当前已有活动导入任务”的统一提示文案
  buildActiveImportJobMessage(state: TenantImportJobState): string {
    return this.tenantJobState.buildActiveImportJobMessage(state);
  }

  // 为租户抢占正式导入活动槽位，防止同租户并发创建多个任务
  async reserveTenantActiveJobSlot(tenantId: string, jobId: string): Promise<boolean> {
    return this.tenantJobState.reserveTenantActiveJobSlot(tenantId, jobId);
  }

  // 仅当当前占位里的 jobId 仍然属于该任务时，才原子清理租户级活动导入状态
  async clearTenantImportJobState(tenantId: string, jobId: string): Promise<void> {
    await this.tenantJobState.clearTenantImportJobState(tenantId, jobId);
  }

  // 判断当前运行模式下，提交正式导入后是否需要立即在本进程触发执行
  shouldEnqueueImmediately(): boolean {
    return shouldStartImportJobImmediately({
      IMPORT_JOB_WORKER_ENABLED: String(this.importSettings.workerEnabled),
    });
  }

  // 轮询数据库中的待执行或失联任务，并重新加入当前进程执行队列
  private async pollRunnableImportJobs(): Promise<void> {
    const staleBefore = dayjs().subtract(IMPORT_JOB_STALE_SECONDS, 'second').toDate();
    const jobs = await this.prisma.importJob.findMany({
      where: {
        OR: [
          { status: PrismaImportJobStatusEnum.PENDING },
          {
            status: PrismaImportJobStatusEnum.PROCESSING,
            OR: [{ heartbeatAt: null }, { heartbeatAt: { lt: staleBefore } }],
          },
        ],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    for (const job of jobs) {
      this.enqueueJob(job.id);
    }
  }

  // 消费单个导入任务队列项，负责加锁、恢复上下文并进入正式执行
  private async runQueuedImportJob(jobId: string): Promise<void> {
    const lockKey = buildImportJobLockKey(jobId);
    const lockValue = await this.redis.acquireLock(lockKey, IMPORT_JOB_LOCK_TTL_SECONDS);
    if (!lockValue) {
      return;
    }

    try {
      const job = await this.prisma.importJob.findUnique({ where: { id: jobId } });
      if (!job || isTerminalImportJobStatus(toImportJobStatus(job.status))) return;

      const snapshot = asPreviewSnapshot(job.snapshot);
      if (!snapshot) {
        await this.markImportJobFailed(jobId, '导入任务缺少可恢复快照，无法继续执行');
        return;
      }

      const progress = readImportJobProgress(job);
      await this.prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: PrismaImportJobStatusEnum.PROCESSING,
          startedAt: job.startedAt ?? new Date(),
          heartbeatAt: new Date(),
        },
      });
      if (!(await this.tenantJobState.renewTenantImportJobState(job.tenantId, jobId, OrderImportJobStatusEnum.PROCESSING))) {
        this.logger.warn(`导入任务进入 processing 时未能续租租户活动锁，tenantId=${job.tenantId}, jobId=${jobId}`);
      }

      await this.processImportJob(job.id, job.tenantId, snapshot, toImportConflictPolicy(job.conflictPolicy), progress, { lockKey, lockValue });
    } catch (error) {
      const message = error instanceof Error ? error.message : '导入任务执行失败';
      this.logger.error(`导入任务执行失败: ${jobId}`, error instanceof Error ? error.stack : undefined);
      await this.markImportJobFailed(jobId, message);
    } finally {
      await this.redis.releaseLock(lockKey, lockValue).catch(() => false);
    }
  }

  // 顺序处理导入快照中的订单，并持续把进度落回数据库
  private async processImportJob(
    jobId: string,
    tenantId: string,
    snapshot: PreviewSnapshot,
    conflictPolicy: ImportConflictPolicy,
    initialProgress: ImportJobProgress,
    lockInfo?: { lockKey: string; lockValue: string },
  ): Promise<void> {
    let progress = initialProgress;
    const tenantStateRenewIntervalMs = Math.max(1, this.importSettings.activeJobTenantRenewIntervalSeconds) * 1000;
    let nextTenantStateRenewAt = dayjs().add(tenantStateRenewIntervalMs, 'millisecond');

    for (let index = progress.processedCount; index < snapshot.orders.length; index += 1) {
      const order = snapshot.orders[index];

      try {
        progress = await this.prisma.$transaction(async (tx) => {
          const outcome = await this.applyImportOrder(tx, tenantId, order, conflictPolicy);
          const nextProgress = nextProgressForOutcome(progress, order, outcome);
          await tx.importJob.update({
            where: { id: jobId },
            data: toImportJobProgressUpdate(nextProgress),
          });
          return nextProgress;
        });
      } catch (error) {
        const nextProgress = nextProgressForFailure(progress, order, this.toImportOrderFailureReason(error, jobId, order));
        await this.prisma.importJob.update({
          where: { id: jobId },
          data: toImportJobProgressUpdate(nextProgress),
        });
        progress = nextProgress;
      }

      if (lockInfo) {
        await this.redis.extendLock(lockInfo.lockKey, lockInfo.lockValue, IMPORT_JOB_LOCK_TTL_SECONDS).catch(() => false);
      }
      if (dayjs().isAfter(nextTenantStateRenewAt) || dayjs().isSame(nextTenantStateRenewAt)) {
        if (!(await this.tenantJobState.renewTenantImportJobState(tenantId, jobId, OrderImportJobStatusEnum.PROCESSING))) {
          this.logger.warn(`导入任务续租租户活动锁失败，tenantId=${tenantId}, jobId=${jobId}`);
        }
        nextTenantStateRenewAt = dayjs().add(tenantStateRenewIntervalMs, 'millisecond');
      }
    }

    await this.prisma.importJob.update({
      where: { id: jobId },
      data: {
        ...toImportJobProgressUpdate(progress),
        status: toPrismaImportJobStatus(resolveFinalStatus(progress)),
        completedAt: new Date(),
        lastError: null,
      },
    });

    this.logger.log(
      `[AUDIT] 导入任务完成 - 租户: ${tenantId}, 任务: ${jobId}, 成功: ${progress.successCount}, 覆盖: ${progress.overwrittenCount}, 跳过: ${progress.skippedCount}, 失败: ${progress.failedOrders.length}`,
    );

    await this.clearTenantImportJobState(tenantId, jobId);
  }

  // 按冲突策略把单笔预检通过的订单写入正式订单表
  private async applyImportOrder(
    client: Prisma.TransactionClient,
    tenantId: string,
    order: PreparedImportOrder,
    conflictPolicy: ImportConflictPolicy,
  ): Promise<ImportOrderOutcome> {
    const existing = await findExistingImportOrder(client, tenantId, order.sourceOrderNo);
    if (existing) {
      if (conflictPolicy === OrderImportConflictPolicyEnum.SKIP) {
        return {
          type: 'skipped',
          existingOrderId: existing.id,
          reason: '源订单号已存在，当前冲突策略为“跳过”，本订单未导入',
        };
      }

      if (await hasSettledImportOrderFlow(client, existing.id)) {
        return {
          type: 'skipped',
          existingOrderId: existing.id,
          reason: '源订单号已存在，且原订单已有收款记录或支付单，为避免账务错误，禁止覆盖',
        };
      }

      await client.order.update({
        where: { id: existing.id },
        data: toImportOrderUpdateInput(order),
      });

      return {
        type: 'overwritten',
        existingOrderId: existing.id,
        reason: '覆盖已有订单成功',
      };
    }

    const orderId = await this.idGen.nextDailyId(ID_CONFIG.ORDER.prefix, ID_CONFIG.ORDER.digits);
    await client.order.create({
      data: { ...toImportOrderCreateInput(tenantId, order), id: orderId } as unknown as Prisma.OrderCreateInput,
    });

    return { type: 'created' };
  }

  // 收口单笔订单导入失败文案：业务错误原样展示，系统错误隐藏内部细节并带上任务 ID
  private toImportOrderFailureReason(error: unknown, jobId: string, order: PreparedImportOrder): string {
    if (error instanceof HttpException) {
      return error.message;
    }

    this.logger.error(
      `导入任务单笔订单处理异常，jobId=${jobId}, sourceOrderNo=${order.sourceOrderNo}`,
      error instanceof Error ? error.stack : String(error),
    );
    return `系统处理订单时异常，请联系管理员并提供导入任务 ID：${jobId}`;
  }

  // 将导入任务显式标记为失败，并同步清理租户级活动占位
  private async markImportJobFailed(jobId: string, message: string): Promise<void> {
    const job = await this.prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: PrismaImportJobStatusEnum.FAILED,
        completedAt: new Date(),
        heartbeatAt: new Date(),
        lastError: cut(message, 500),
      },
      select: { tenantId: true },
    });

    this.logger.warn(`[AUDIT] [ALARM] 导入任务异常终止 - 租户: ${job.tenantId}, 任务: ${jobId}, 错误: ${message}`);

    await this.clearTenantImportJobState(job.tenantId, jobId);
  }
}
