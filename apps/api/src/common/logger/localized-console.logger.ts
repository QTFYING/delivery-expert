import { ConsoleLogger } from '@nestjs/common';

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

export class LocalizedConsoleLogger extends ConsoleLogger {
  protected getTimestamp(): string {
    return BEIJING_TIME_FORMATTER.format(new Date());
  }
}
