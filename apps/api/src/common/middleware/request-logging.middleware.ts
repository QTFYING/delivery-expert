import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { ensureTraceId, TRACE_ID_HEADER } from '../request-trace';
import { runWithTraceContext } from '../trace-context';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HttpRequest');

  /** 为每个 HTTP 请求补齐 traceId，并在请求结束时输出基础访问日志 */
  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = Date.now();
    const traceId = ensureTraceId(req);
    const requestPath = req.originalUrl || req.url;

    runWithTraceContext({ traceId, method: req.method, path: requestPath, startedAt }, () => {
      res.setHeader(TRACE_ID_HEADER, traceId);

      res.on('finish', () => {
        const durationMs = Date.now() - startedAt;
        const statusCode = res.statusCode;
        const method = req.method;
        const ip = this.getClientIp(req);
        const proxyEnv = this.getHeader(req, 'x-proxy-env');
        const origin = this.getHeader(req, 'origin');
        const requestId = this.getHeader(req, 'x-request-id');

        const context = [
          `traceId=${traceId}`,
          `${method} ${requestPath}`,
          `status=${statusCode}`,
          `duration=${durationMs}ms`,
          `ip=${ip}`,
          origin ? `origin=${origin}` : null,
          proxyEnv ? `proxyEnv=${proxyEnv}` : null,
          requestId && requestId !== traceId ? `requestId=${requestId}` : null,
        ]
          .filter(Boolean)
          .join(' ');

        if (statusCode >= 500) {
          this.logger.error(context);
          return;
        }

        if (statusCode >= 400) {
          this.logger.warn(context);
          return;
        }

        this.logger.log(context);
      });

      next();
    });
  }

  /** 提取真实客户端 IP，优先兼容代理层写入的 x-forwarded-for */
  private getClientIp(req: Request): string {
    const forwardedFor = this.getHeader(req, 'x-forwarded-for');
    if (forwardedFor) {
      return forwardedFor.split(',')[0]?.trim() || req.ip || '-';
    }

    return req.ip || req.socket.remoteAddress || '-';
  }

  /** 读取单值请求头，数组请求头只取第一个有效值 */
  private getHeader(req: Request, headerName: string): string | null {
    const headerValue = req.headers[headerName];
    if (Array.isArray(headerValue)) {
      return headerValue[0]?.trim() || null;
    }

    if (typeof headerValue === 'string') {
      return headerValue.trim() || null;
    }

    return null;
  }
}
