import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HttpRequest');

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = Date.now();

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      const statusCode = res.statusCode;
      const requestPath = req.originalUrl || req.url;
      const method = req.method;
      const ip = this.getClientIp(req);
      const proxyEnv = this.getHeader(req, 'x-proxy-env');
      const origin = this.getHeader(req, 'origin');
      const requestId = this.getHeader(req, 'x-request-id');

      const context = [
        `${method} ${requestPath}`,
        `status=${statusCode}`,
        `duration=${durationMs}ms`,
        `ip=${ip}`,
        origin ? `origin=${origin}` : null,
        proxyEnv ? `proxyEnv=${proxyEnv}` : null,
        requestId ? `requestId=${requestId}` : null,
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
  }

  private getClientIp(req: Request): string {
    const forwardedFor = this.getHeader(req, 'x-forwarded-for');
    if (forwardedFor) {
      return forwardedFor.split(',')[0]?.trim() || req.ip || '-';
    }

    return req.ip || req.socket.remoteAddress || '-';
  }

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
