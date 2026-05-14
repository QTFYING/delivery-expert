import { registerAs } from '@nestjs/config';
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } from '../auth/auth-session.util';

function parseCookieSecureOverride(value?: string): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

export const authConfig = registerAs('auth', () => ({
  jwtSecret: process.env.JWT_SECRET ?? '',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  cookieSecureOverride: parseCookieSecureOverride(process.env.AUTH_COOKIE_SECURE),
  accessTokenTtlSeconds: ACCESS_TOKEN_TTL,
  refreshTokenTtlSeconds: REFRESH_TOKEN_TTL,
}));
