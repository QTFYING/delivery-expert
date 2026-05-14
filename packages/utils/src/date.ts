import dayjs from 'dayjs';

export const formatDate = (date: Date | string | number, format = 'YYYY-MM-DD HH:mm:ss') => {
  return dayjs(date).format(format);
};
