import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { LakalaWebhookDto } from '../dto/lakala-webhook.dto';
import { readLakalaString } from './lakala.adapter';

export type LakalaWebhookRequest = {
  rawBody: string;
  contentType?: string;
  headerSnapshot: Record<string, unknown>;
};

export type NormalizedLakalaWebhookPayload = {
  // 我方商户单号，对应本地 payment_orders.gatewayTradeNo
  gatewayTradeNo?: string;
  // 拉卡拉回调交易状态，当前成功样本使用 order_trade_info.trade_status
  externalStatus?: string;
  // 拉卡拉回调金额字段，单位分
  amountFen?: string;
  // 拉卡拉返回的失败原因或渠道提示文案
  failureMessage?: string;
  // 拉卡拉原始支付时间字符串，后续再统一解析成 Date
  paidAtRaw?: string;
};

type RequestWithRawBody = Request & { rawBody?: string; body?: unknown };

type LakalaTradeInfo = {
  // 交易状态，当前成功样本为 S
  trade_status?: unknown;
  // 交易完成时间，格式如 20260428141646
  trade_time?: unknown;
  // 交易金额，单位分
  trade_amount?: unknown;
  // 付款方实付金额，单位分
  payer_amount?: unknown;
};

// 从 Express 请求中提取 Webhook 原始报文和最小头信息，供验签与审计使用
export function readLakalaWebhookRequest(req: RequestWithRawBody, authorization?: string): LakalaWebhookRequest {
  const contentType = readContentType(req);
  const authorizationScheme = readAuthorizationScheme(authorization);

  return {
    rawBody: readRawBody(req),
    contentType,
    headerSnapshot: {
      contentType,
      hasAuthorization: Boolean(authorization),
      authorizationScheme,
    },
  };
}

// 只解析当前已跑通的 application/json 回调，格式错误直接按 400 拒绝
export function parseCurrentLakalaWebhookJson(request: LakalaWebhookRequest): LakalaWebhookDto {
  if (!request.rawBody) {
    return {};
  }

  if (!request.contentType?.includes('application/json')) {
    throw new BadRequestException('Unsupported webhook content type');
  }

  try {
    return JSON.parse(request.rawBody) as LakalaWebhookDto;
  } catch {
    throw new BadRequestException('Webhook body is invalid JSON');
  }
}

// 归一当前版本拉卡拉 JSON 报文，保持显式字段映射，不扩展旧报文猜测兼容
export function normalizeCurrentLakalaWebhookPayload(payload: LakalaWebhookDto): NormalizedLakalaWebhookPayload {
  const tradeInfo = readTradeInfo(payload);

  return {
    gatewayTradeNo: readLakalaString(payload.out_order_no),
    externalStatus: readLakalaString(tradeInfo.trade_status),
    amountFen: readLakalaString(payload.total_amount ?? tradeInfo.trade_amount ?? tradeInfo.payer_amount),
    failureMessage: readLakalaString(payload.channel_ret_msg ?? payload.message),
    paidAtRaw: readLakalaString(tradeInfo.trade_time),
  };
}

// 读取当前版本回调中的交易明细；字符串形式只做同结构 JSON 还原
function readTradeInfo(payload: LakalaWebhookDto): LakalaTradeInfo {
  if (typeof payload.order_trade_info === 'string') {
    try {
      const parsed = JSON.parse(payload.order_trade_info) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as LakalaTradeInfo;
      }
    } catch {
      return {};
    }
  }

  if (!payload.order_trade_info || typeof payload.order_trade_info !== 'object' || Array.isArray(payload.order_trade_info)) {
    return {};
  }

  return payload.order_trade_info as LakalaTradeInfo;
}

// 优先使用启动阶段捕获的 rawBody，兼容后续按 Buffer 进入 controller 的场景
function readRawBody(req: RequestWithRawBody): string {
  if (typeof req.rawBody === 'string') {
    return req.rawBody;
  }

  if (Buffer.isBuffer(req.body)) {
    return req.body.toString('utf8');
  }

  if (typeof req.body === 'string') {
    return req.body;
  }

  return '';
}

// 标准化 content-type，用于严格校验当前支持的 JSON 回调
function readContentType(req: RequestWithRawBody): string | undefined {
  const value = req.headers['content-type'];
  if (Array.isArray(value)) {
    return value[0]?.toLowerCase();
  }

  return typeof value === 'string' ? value.toLowerCase() : undefined;
}

// 审计记录只保留认证方案，不持久化完整签名头
function readAuthorizationScheme(authorization?: string): string | undefined {
  const value = readLakalaString(authorization);
  return value?.split(/\s+/, 1)[0];
}
