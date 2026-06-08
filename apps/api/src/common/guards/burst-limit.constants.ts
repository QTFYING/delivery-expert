export const BURST_LIMIT_KEY = 'burstLimit';

export interface BurstLimitOptions {
  windowMs?: number;
  message?: string;
}

export interface ResolvedBurstLimitOptions {
  windowMs: number;
  message: string;
}

export const DEFAULT_BURST_LIMIT_OPTIONS: ResolvedBurstLimitOptions = {
  windowMs: 300,
  message: '请求过于频繁，请稍后再试',
};
