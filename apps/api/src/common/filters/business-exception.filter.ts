import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { BusinessException } from '../exceptions/business.exception';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // 业务异常 — 使用自定义 bizCode
    if (exception instanceof BusinessException) {
      const status = exception.getStatus();
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

      return response.status(status).json({
        code: bizCode,
        message,
        data: null,
      });
    }

    // 未知异常
    console.error('Unhandled exception:', exception);
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 5000,
      message: '服务器内部错误',
      data: null,
    });
  }
}
