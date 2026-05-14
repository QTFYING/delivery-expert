export const IMPORT_PREVIEW_TTL_SECONDS = 900;
export const IMPORT_PREVIEW_USER_LOCK_SECONDS = 30;
export const IMPORT_PREVIEW_CONSUME_LOCK_SECONDS = 30;

export function buildImportPreviewKey(previewId: string): string {
  return `import:preview:${previewId}`;
}

export function buildImportPreviewConsumeLockKey(previewId: string): string {
  return `import:preview:consume:${previewId}`;
}

export function buildImportUserPreviewLockKey(tenantId: string, userId: string): string {
  return `import:user:${tenantId}:${userId}:preview`;
}
