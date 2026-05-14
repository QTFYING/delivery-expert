import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 业务异常 — 携带自定义业务错误码（见 docs/API.md §1.6）
 * 用法: throw new BusinessException(1001, '订单已支付，禁止重复操作', HttpStatus.CONFLICT);
 */
export class BusinessException extends HttpException {
  public readonly bizCode: number;

  constructor(bizCode: number, message: string, httpStatus: HttpStatus = HttpStatus.BAD_REQUEST) {
    super({ bizCode, message }, httpStatus);
    this.bizCode = bizCode;
  }
}
