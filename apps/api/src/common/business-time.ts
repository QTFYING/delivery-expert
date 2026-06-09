import dayjs, { type Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

export const BUSINESS_TIME_ZONE = 'Asia/Shanghai';

const LOCAL_DATE_TIME_FORMATS = ['YYYY-MM-DD', 'YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD HH:mm:ss.SSS', 'YYYY-MM-DDTHH:mm:ss', 'YYYY-MM-DDTHH:mm:ss.SSS'];
const LOCAL_TIMESTAMP_FORMAT = 'YYYY-MM-DD HH:mm:ss.SSS';

export function parseBusinessLocalTimestampCarrier(value: string): Date | undefined {
  const parsed = LOCAL_DATE_TIME_FORMATS.map((format) => dayjs.utc(value, format, true)).find((item) => item.isValid());
  return parsed ? parsed.toDate() : undefined;
}

export function formatBusinessLocalTimestampCarrier(value: Date, format = 'YYYY-MM-DD HH:mm:ss'): string {
  return dayjs.utc(value).format(format);
}

export function businessLocalTimestampCarrierToInstant(value: Date): Dayjs {
  return dayjs.tz(formatBusinessLocalTimestampCarrier(value, LOCAL_TIMESTAMP_FORMAT), LOCAL_TIMESTAMP_FORMAT, BUSINESS_TIME_ZONE);
}

export function businessInstantToLocalTimestampCarrierDayStart(value: Date, offsetDays = 0): Date {
  const boundary = dayjs(value).tz(BUSINESS_TIME_ZONE).startOf('day').add(offsetDays, 'day');
  const carrier = parseBusinessLocalTimestampCarrier(boundary.format(LOCAL_TIMESTAMP_FORMAT));
  if (!carrier) {
    throw new Error('北京时间自然日边界解析失败');
  }

  return carrier;
}
