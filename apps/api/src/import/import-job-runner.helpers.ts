import { Prisma } from '@prisma/client';
import { OrderImportConflictPolicyEnum, type OrderImportJobStatus } from '@shou/types/enums';
import { resolveImportJobFinalStatus } from './import-job.worker.helpers';
import type { PreparedImportOrder } from './import.normalizer';
import type { ImportJobProgress, ImportOrderOutcome, PreviewSnapshot, TenantImportJobState } from './import.types';
import { asConflictDetails, asJobFailures } from './mapping/import.mapper';

export type ImportConflictPolicy = (typeof OrderImportConflictPolicyEnum)[keyof typeof OrderImportConflictPolicyEnum];

export type ImportJobProgressRecord = {
  processedCount: number;
  successCount: number;
  skippedCount: number;
  overwrittenCount: number;
  failedOrders: Prisma.JsonValue | null;
  conflictDetails: Prisma.JsonValue | null;
};

export function buildTenantImportJobState(jobId: string, status: OrderImportJobStatus): TenantImportJobState {
  const now = Date.now();
  return { jobId, status, createdAt: now, updatedAt: now };
}

export function nextProgressForOutcome(current: ImportJobProgress, order: PreparedImportOrder, outcome: ImportOrderOutcome): ImportJobProgress {
  const next: ImportJobProgress = {
    processedCount: current.processedCount + 1,
    successCount: current.successCount,
    skippedCount: current.skippedCount,
    overwrittenCount: current.overwrittenCount,
    failedOrders: [...current.failedOrders],
    conflictDetails: [...current.conflictDetails],
  };

  if (outcome.type === 'created') {
    next.successCount += 1;
    return next;
  }

  next.conflictDetails.push({
    sourceOrderNo: order.sourceOrderNo,
    existingOrderId: outcome.existingOrderId,
    action: outcome.type === 'overwritten' ? OrderImportConflictPolicyEnum.OVERWRITE : OrderImportConflictPolicyEnum.SKIP,
    reason: outcome.reason ?? '导入任务处理完成',
  });

  if (outcome.type === 'overwritten') {
    next.overwrittenCount += 1;
  } else {
    next.skippedCount += 1;
  }

  return next;
}

export function nextProgressForFailure(current: ImportJobProgress, order: PreparedImportOrder, error: unknown): ImportJobProgress {
  return {
    processedCount: current.processedCount + 1,
    successCount: current.successCount,
    skippedCount: current.skippedCount,
    overwrittenCount: current.overwrittenCount,
    failedOrders: [
      ...current.failedOrders,
      {
        index: order.index,
        sourceOrderNo: order.sourceOrderNo,
        reason: error instanceof Error ? error.message : '导入处理失败',
      },
    ],
    conflictDetails: [...current.conflictDetails],
  };
}

export function readImportJobProgress(job: ImportJobProgressRecord): ImportJobProgress {
  return {
    processedCount: job.processedCount,
    successCount: job.successCount,
    skippedCount: job.skippedCount,
    overwrittenCount: job.overwrittenCount,
    failedOrders: asJobFailures(job.failedOrders),
    conflictDetails: asConflictDetails(job.conflictDetails),
  };
}

export function toImportJobProgressUpdate(progress: ImportJobProgress): Prisma.ImportJobUpdateInput {
  return {
    processedCount: progress.processedCount,
    successCount: progress.successCount,
    skippedCount: progress.skippedCount,
    overwrittenCount: progress.overwrittenCount,
    failedCount: progress.failedOrders.length,
    failedOrders: progress.failedOrders as unknown as Prisma.InputJsonValue,
    conflictDetails: progress.conflictDetails as unknown as Prisma.InputJsonValue,
    heartbeatAt: new Date(),
  };
}

export function resolveFinalStatus(progress: ImportJobProgress): OrderImportJobStatus {
  return resolveImportJobFinalStatus({
    successCount: progress.successCount,
    skippedCount: progress.skippedCount,
    overwrittenCount: progress.overwrittenCount,
    failedCount: progress.failedOrders.length,
  });
}

export function asPreviewSnapshot(value: Prisma.JsonValue | null): PreviewSnapshot | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as unknown as PreviewSnapshot) : null;
}

export function buildImportJobLockKey(jobId: string): string {
  return `import:job:lock:${jobId}`;
}
