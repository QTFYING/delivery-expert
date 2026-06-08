import type { Params } from 'nestjs-pino';

const BEIJING_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** 构造 API 进程的 pino 日志配置 保留机器友好 UTC 与人工可读北京时间 */
export function buildPinoLoggerOptions(): Params {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    pinoHttp: {
      autoLogging: false,
      base: undefined,
      level: isProduction ? 'info' : 'debug',
      timestamp: () => {
        const now = new Date();
        return `,"time":"${now.toISOString()}","timeLocal":"${formatBeijingTime(now)}"`;
      },
      transport: isProduction
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              colorize: false,
              ignore: 'req',
              singleLine: true,
              translateTime: false,
            },
          },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-access-token"]',
          'res.headers.set-cookie',
          '*.password',
          '*.refreshToken',
          '*.accessToken',
        ],
        censor: '[REDACTED]',
      },
    },
  };
}

function formatBeijingTime(value: Date): string {
  return BEIJING_TIME_FORMATTER.format(value).replace(/\//g, '-');
}
