import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  timezone: process.env.TZ ?? 'UTC',
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
}));
