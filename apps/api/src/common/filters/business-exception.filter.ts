import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { BusinessException } from '../exceptions/business.exception';
import { ensureTraceId, TRACE_ID_HEADER } from '../request-trace';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  /** 统一处理异常响应，并确保错误响应可通过 traceId 关联日志 */
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const traceId = ensureTraceId(request);
    const errorContext = this.buildErrorContext(request, traceId);

    response.setHeader(TRACE_ID_HEADER, traceId);

    // 业务异常 — 使用自定义 bizCode
    if (exception instanceof BusinessException) {
      const status = exception.getStatus();
      if (status >= 500) {
        this.logger.error(
          `${errorContext} status=${status} code=${exception.bizCode} message=${exception.message}`,
          exception.stack,
        );
      }

      return response.status(status).json({
        code: exception.bizCode,
        message: exception.message,
        data: null,
      });
    }

    // NestJS 内置 HttpException（ValidationPipe、UnauthorizedException 等）
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      let message = 'error';
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        // class-validator 返回 message 数组
        if (Array.isArray(resp.message)) {
          message = resp.message.join('; ');
        } else if (typeof resp.message === 'string') {
          message = resp.message;
        }
      }

      // 映射到业务错误码
      let bizCode = 5000;
      if (status === HttpStatus.UNAUTHORIZED) bizCode = 4001;
      else if (status === HttpStatus.FORBIDDEN) bizCode = 4003;
      else if (status === HttpStatus.NOT_FOUND) bizCode = 4004;
      else if (status === HttpStatus.CONFLICT) bizCode = 4009;
      else if (status === HttpStatus.UNPROCESSABLE_ENTITY) bizCode = 4022;
      else if (status >= 400 && status < 500) bizCode = 4022;

      if (status >= 500) {
        this.logger.error(`${errorContext} status=${status} code=${bizCode} message=${message}`, exception.stack);
      }

      return response.status(status).json({
        code: bizCode,
        message,
        data: null,
      });
    }

    // 未知异常
    const message = exception instanceof Error ? exception.message : String(exception);
    const stack = exception instanceof Error ? exception.stack : undefined;
    this.logger.error(`${errorContext} status=500 code=5000 message=${message}`, stack);
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 5000,
      message: '服务器内部错误',
      data: null,
    });
  }

  /** 构建异常日志上下文，保留请求方法、路径和 traceId */
  private buildErrorContext(request: Request, traceId: string): string {
    const requestPath = request.originalUrl || request.url || '-';
    return `traceId=${traceId} ${request.method} ${requestPath}`;
  }
}
