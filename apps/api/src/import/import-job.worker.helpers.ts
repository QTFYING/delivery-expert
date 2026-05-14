import { OrderImportJobStatusEnum, type OrderImportJobStatus } from '@shou/types/enums';

export interface ImportJobProgressSnapshot {
  successCount: number;
  skippedCount: number;
  overwrittenCount: number;
  failedCount: number;
}

export interface ImportWorkerEnvLike {
  IMPORT_JOB_WORKER_ENABLED?: string;
}

export function isImportWorkerEnabled(env: ImportWorkerEnvLike): boolean {
  return env.IMPORT_JOB_WORKER_ENABLED === 'true';
}

export function isTerminalImportJobStatus(status: OrderImportJobStatus): boolean {
  return status === OrderImportJobStatusEnum.COMPLETED || status === OrderImportJobStatusEnum.FAILED;
}

export function resolveImportJobFinalStatus(progress: ImportJobProgressSnapshot): OrderImportJobStatus {
  return progress.failedCount > 0 && progress.successCount === 0 && progress.overwrittenCount === 0 && progress.skippedCount === 0
    ? OrderImportJobStatusEnum.FAILED
    : OrderImportJobStatusEnum.COMPLETED;
}

export function shouldStartImportJobImmediately(env: ImportWorkerEnvLike): boolean {
  return isImportWorkerEnabled(env);
}
