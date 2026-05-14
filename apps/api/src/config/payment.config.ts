import { registerAs } from '@nestjs/config';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

const LAKALA_COUNTER_CREATE_PATH = '/api/v3/ccss/counter/order/special_create';

export const paymentConfig = registerAs('payment', () => {
  const lakalaBaseUrl = trimTrailingSlash(process.env.LAKALA_BASE_URL?.trim() || 'https://api.lakala.com');

  return {
    lakalaBaseUrl,
    lakalaAppId: process.env.LAKALA_APP_ID?.trim() || '',
    lakalaSerialNo: process.env.LAKALA_SERIAL_NO?.trim() || '',
    lakalaPrivateKey: process.env.LAKALA_PRIVATE_KEY ?? '',
    lakalaPlatformPublicKey: process.env.LAKALA_PLATFORM_PUBLIC_KEY ?? '',
    lakalaNotifyUrl: process.env.LAKALA_NOTIFY_URL?.trim() || '',
    lakalaCounterCreateUrl: `${lakalaBaseUrl}${LAKALA_COUNTER_CREATE_PATH}`,
  };
});
