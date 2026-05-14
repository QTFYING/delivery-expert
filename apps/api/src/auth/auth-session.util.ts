import { CookieOptions, Request, Response } from 'express';

export const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
export const ACCESS_TOKEN_TTL = 2 * 60 * 60; // 2 hours in seconds

const DEV_REFRESH_COOKIE_NAME = 'refreshToken';
const PROD_REFRESH_COOKIE_NAME = '__Host-refreshToken';

export interface AuthCookieSettings {
  nodeEnv: string;
  cookieSecureOverride?: boolean;
}

/**
 * 判断是否应使用安全（secure）Cookie
 *
 * @param req - HTTP 请求对象，用于检查协议和请求头信息
 * @param settings - 认证 Cookie 配置对象，包含环境变量和可选的安全覆盖设置
 * @returns 若应使用 secure Cookie 返回 true，否则返回 false
 */
function shouldUseSecureCookies(req: Request, settings: AuthCookieSettings): boolean {
  const canOverride = settings.cookieSecureOverride;
  if (canOverride === true) return true;
  if (canOverride === false) return false;

  // 尝试从 X-Forwarded-Proto 头中获取原始协议（用于反向代理场景）
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;

  if (typeof proto === 'string') {
    return proto.split(',')[0]?.trim() === 'https';
  }

  // 默认行为：若请求本身是安全的，或处于生产环境，则使用 secure Cookie
  return req.secure || settings.nodeEnv === 'production';
}

/**
 * 根据当前请求和配置获取刷新令牌 Cookie 的名称
 * 在安全上下文中使用生产环境名称，否则使用开发环境名称
 *
 * @param req - HTTP 请求对象
 * @param settings - 认证 Cookie 配置对象
 * @returns 刷新令牌 Cookie 的名称
 */
export function getRefreshTokenCookieName(req: Request, settings: AuthCookieSettings): string {
  return shouldUseSecureCookies(req, settings) ? PROD_REFRESH_COOKIE_NAME : DEV_REFRESH_COOKIE_NAME;
}

/**
 * 获取用于设置刷新令牌 Cookie 的选项配置
 *
 * @param req - HTTP 请求对象
 * @param settings - 认证 Cookie 配置对象
 * @returns 包含 httpOnly、secure、sameSite 等属性的 CookieOptions 对象
 */
export function getRefreshTokenCookieOptions(req: Request, settings: AuthCookieSettings): CookieOptions {
  return {
    httpOnly: true,
    secure: shouldUseSecureCookies(req, settings),
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_TOKEN_TTL * 1000,
  };
}

/**
 * 获取用于清除刷新令牌 Cookie 的选项配置
 *
 * @param req - HTTP 请求对象（此处未实际使用，保留参数以保持接口一致性）
 * @returns 仅包含 path 属性的 CookieOptions 对象
 */
function getRefreshTokenClearCookieOptions(req: Request): CookieOptions {
  void req;
  return { path: '/' };
}

/**
 * 在响应中设置刷新令牌 Cookie
 *
 * @param res - HTTP 响应对象
 * @param req - HTTP 请求对象
 * @param refreshToken - 要设置的刷新令牌字符串
 * @param settings - 认证 Cookie 配置对象
 */
export function setRefreshTokenCookie(res: Response, req: Request, refreshToken: string, settings: AuthCookieSettings): void {
  res.cookie(getRefreshTokenCookieName(req, settings), refreshToken, getRefreshTokenCookieOptions(req, settings));
}

/**
 * 从客户端清除刷新令牌 Cookie
 *
 * @param res - HTTP 响应对象
 * @param req - HTTP 请求对象
 * @param settings - 认证 Cookie 配置对象
 */
export function clearRefreshTokenCookie(res: Response, req: Request, settings: AuthCookieSettings): void {
  res.clearCookie(getRefreshTokenCookieName(req, settings), getRefreshTokenClearCookieOptions(req));
}

/**
 * 从请求 Cookie 中提取刷新令牌
 *
 * @param req - HTTP 请求对象
 * @param settings - 认证 Cookie 配置对象
 * @returns 若找到匹配的刷新令牌则返回其值，否则返回 null
 */
export function getRefreshTokenFromCookie(req: Request, settings: AuthCookieSettings): string | null {
  const rawCookie = req.headers.cookie;
  if (!rawCookie) return null;

  const cookieName = getRefreshTokenCookieName(req, settings);
  const cookies = rawCookie.split(';');

  for (const cookie of cookies) {
    const [rawKey, ...rawValueParts] = cookie.split('=');
    if (!rawKey || rawValueParts.length === 0) continue;

    if (rawKey.trim() !== cookieName) continue;

    return decodeURIComponent(rawValueParts.join('=').trim());
  }

  return null;
}

/**
 * 从 Authorization 请求头中提取 Bearer Token
 *
 * @param authHeader - Authorization 请求头的值
 * @returns 若存在有效的 Bearer Token 则返回其值，否则返回 null
 */
export function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
