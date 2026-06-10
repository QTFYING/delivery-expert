import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { BurstLimitGuard } from '../guards/burst-limit.guard';
import { BURST_LIMIT_KEY, BurstLimitOptions, DEFAULT_BURST_LIMIT_OPTIONS, ResolvedBurstLimitOptions } from '../guards/burst-limit.constants';

export const BurstLimit = (options: BurstLimitOptions = {}) =>
  applyDecorators(
    SetMetadata(BURST_LIMIT_KEY, {
      ...DEFAULT_BURST_LIMIT_OPTIONS,
      ...options,
    } satisfies ResolvedBurstLimitOptions),
    UseGuards(BurstLimitGuard),
  );
