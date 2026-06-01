import { randomUUID } from 'crypto';
import type { Request } from 'express';

export const TRACE_ID_HEADER = 'x-trace-id';
export const REQUEST_ID_HEADER = 'x-request-id';

const TRACE_ID_MAX_LENGTH = 128;
const TRACE_ID_SAFE_CHARS = /[^a-zA-Z0-9._:/=-]/g;

export type RequestWithTraceId = Request & { traceId?: string };

/** 确保当前请求拥有稳定 traceId，优先透传上游链路标识 */
export function ensureTraceId(req: Request): string {
  const tracedReq = req as RequestWithTraceId;
  const existingTraceId = normalizeTraceId(tracedReq.traceId);
  if (existingTraceId) {
    tracedReq.traceId = existingTraceId;
    return existingTraceId;
  }

  const traceId =
    getTraceHeader(req, TRACE_ID_HEADER) ??
    getTraceHeader(req, REQUEST_ID_HEADER) ??
    randomUUID();
  tracedReq.traceId = traceId;
  return traceId;
}

function getTraceHeader(req: Request, headerName: string): string | null {
  const headerValue = req.headers[headerName];
  if (Array.isArray(headerValue)) {
    return normalizeTraceId(headerValue[0]);
  }

  return normalizeTraceId(headerValue);
}

function normalizeTraceId(value: string | undefined): string | null {
  const traceId = value?.trim().replace(TRACE_ID_SAFE_CHARS, '').slice(0, TRACE_ID_MAX_LENGTH);
  return traceId || null;
}
