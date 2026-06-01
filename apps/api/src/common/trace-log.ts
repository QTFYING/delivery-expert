import { getCurrentTraceId } from './trace-context';

type TraceLogPrimitive = string | number | boolean;
export type TraceLogValue = TraceLogPrimitive | null | undefined | readonly (TraceLogPrimitive | null | undefined)[];

const TRACE_LOG_WHITESPACE = /\s+/g;

/** 构造统一 key=value 业务日志，默认自动带上当前 traceId */
export function formatTraceLog(event: string, fields: Record<string, TraceLogValue> = {}, traceId: string | null = getCurrentTraceId()): string {
  const parts = [traceId ? `traceId=${normalizeTraceLogValue(traceId)}` : null, `event=${normalizeTraceLogValue(event)}`];

  for (const [key, value] of Object.entries(fields)) {
    const normalizedValue = normalizeTraceLogValue(value);
    if (normalizedValue) {
      parts.push(`${key}=${normalizedValue}`);
    }
  }

  return parts.filter((part): part is string => Boolean(part)).join(' ');
}

function normalizeTraceLogValue(value: TraceLogValue): string | null {
  if (Array.isArray(value)) {
    const normalizedItems = value.map((item) => normalizeTraceLogValue(item)).filter((item): item is string => Boolean(item));
    return normalizedItems.length > 0 ? normalizedItems.join(',') : null;
  }

  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = String(value).trim().replace(TRACE_LOG_WHITESPACE, '_');
  return normalizedValue || null;
}
