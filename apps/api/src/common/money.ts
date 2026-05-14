import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

export function decimal(value: Prisma.Decimal | Decimal.Value): Decimal {
  return new Decimal(value.toString());
}

export function toDecimal(value: number, label: string, scale: number, allowZero = false): Decimal {
  if (!Number.isFinite(value)) {
    throw new BadRequestException(`${label} 必须是合法数字`);
  }

  const result = new Decimal(String(value)).toDecimalPlaces(scale);
  if (allowZero ? result.lt(0) : result.lte(0)) {
    throw new BadRequestException(`${label} 必须${allowZero ? '大于等于' : '大于'} 0`);
  }

  return result;
}

export function toMoney(value: number, label: string, allowZero = false): Decimal {
  return toDecimal(value, label, 2, allowZero);
}

export function toPrismaDecimal(value: Decimal): Prisma.Decimal {
  return new Prisma.Decimal(value.toString());
}

export function toMoneyNumber(value: Prisma.Decimal | Decimal.Value): number {
  return Number(decimal(value).toFixed(2));
}

export function toDecimalNumber(value: Prisma.Decimal | Decimal.Value, scale: number): number {
  return Number(decimal(value).toFixed(scale));
}
