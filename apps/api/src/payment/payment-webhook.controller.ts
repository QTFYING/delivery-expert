import { Controller, Headers, HttpException, Logger, Post, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { readLakalaWebhookRequest } from './gateway/lakala-webhook.normalizer';
import { PaymentService } from './payment.service';

type RequestWithRawBody = Request & { rawBody?: string; body?: unknown };

@ApiTags('Payment Webhook')
@Controller('payment')
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

  constructor(private readonly paymentService: PaymentService) {}

  // 处理当前已联调跑通的拉卡拉 JSON 回调，并按平台要求返回固定结果结构
  @ApiOperation({ summary: '拉卡拉支付回调' })
  @ApiOkResponse({
    description: '回调处理结果',
    schema: { type: 'object', additionalProperties: true },
  })
  @Post('webhook/lakala')
  async handleLakalaWebhook(@Headers('authorization') authorization: string | undefined, @Req() req: RequestWithRawBody, @Res() res: Response) {
    const webhookRequest = readLakalaWebhookRequest(req, authorization);
    try {
      const result = await this.paymentService.handleLakalaWebhook(webhookRequest, {
        authorization,
      });
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof HttpException) {
        const status = error.getStatus();
        const response = error.getResponse();
        const message =
          typeof response === 'string'
            ? response
            : typeof response === 'object' && response !== null && typeof (response as { message?: unknown }).message === 'string'
              ? (response as { message: string }).message
              : error.message;
        this.logger.warn(
          `拉卡拉 Webhook 返回 ${status}: ${message} contentType=${webhookRequest.contentType || '-'} rawLength=${webhookRequest.rawBody.length}`,
        );
        return res.status(status).json({ code: 'FAIL', message });
      }

      this.logger.error(`拉卡拉 Webhook 处理异常 contentType=${webhookRequest.contentType || '-'} rawLength=${webhookRequest.rawBody.length}`);
      return res.status(500).json({ code: 'FAIL', message: 'Webhook handling failed' });
    }
  }
}
