import { AsyncLocalStorage } from 'async_hooks';

export interface TraceContext {
  traceId: string;
  method?: string;
  path?: string;
  startedAt?: number;
}

const traceContextStorage = new AsyncLocalStorage<TraceContext>();

/** 在当前异步调用链中绑定 trace 上下文，供 service、guard 与 strategy 读取 */
export function runWithTraceContext<T>(context: TraceContext, callback: () => T): T {
  return traceContextStorage.run(context, callback);
}

/** 读取当前请求的 trace 上下文，非 HTTP 调用链中返回 null */
export function getTraceContext(): TraceContext | null {
  return traceContextStorage.getStore() ?? null;
}

/** 读取当前请求 traceId，供业务日志闭环复用 */
export function getCurrentTraceId(): string | null {
  return getTraceContext()?.traceId ?? null;
}
