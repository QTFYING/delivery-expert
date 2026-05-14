import type {
  OrderImportDuplicateOrder,
  OrderImportJobConflictDetail,
  OrderImportJobFailure,
  OrderImportPreviewError,
  OrderImportPreviewSummary,
} from '@shou/types/contracts';
import type { OrderImportJobStatus } from '@shou/types/enums';
import type { PreparedImportOrder } from './import.normalizer';

export interface PreviewSnapshot {
  previewId: string;
  tenantId: string;
  templateId: string;
  importRevision: number;
  summary: OrderImportPreviewSummary;
  orders: PreparedImportOrder[];
  duplicateOrders: OrderImportDuplicateOrder[];
  invalidOrders: OrderImportPreviewError[];
}

export interface TenantImportJobState {
  jobId: string;
  status: OrderImportJobStatus;
  createdAt: number;
  updatedAt: number;
}

export interface ImportJobProgress {
  processedCount: number;
  successCount: number;
  skippedCount: number;
  overwrittenCount: number;
  failedOrders: OrderImportJobFailure[];
  conflictDetails: OrderImportJobConflictDetail[];
}

export interface ImportOrderOutcome {
  type: 'created' | 'skipped' | 'overwritten';
  existingOrderId?: string;
  reason?: string;
}
