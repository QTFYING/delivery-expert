import { Injectable } from '@nestjs/common';
import { PaymentChannelEnum as PrismaPaymentChannelEnum } from '@prisma/client';
import { BusinessException } from '../../common/exceptions/business.exception';
import { LakalaGatewayProvider } from './lakala-gateway.provider';
import type { PaymentGatewayProvider } from './payment-gateway.types';

@Injectable()
export class PaymentGatewayRegistry {
  private readonly providers: Map<PrismaPaymentChannelEnum, PaymentGatewayProvider>;

  constructor(lakalaProvider: LakalaGatewayProvider) {
    this.providers = new Map([[lakalaProvider.channel, lakalaProvider]]);
  }

  // 按平台内部支付通道选择网关实现，后续新增渠道只需要注册新的 provider
  getProvider(channel: PrismaPaymentChannelEnum): PaymentGatewayProvider {
    const provider = this.providers.get(channel);
    if (!provider) {
      throw new BusinessException(50001, `未配置支付通道: ${channel}`, 500);
    }

    return provider;
  }
}
