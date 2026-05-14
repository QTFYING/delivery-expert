import { randomBytes } from 'crypto';

export function generateQrCodeToken(): string {
  return randomBytes(32).toString('hex');
}
