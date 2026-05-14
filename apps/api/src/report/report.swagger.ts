import { ApiProperty } from '@nestjs/swagger';
import type {
  AnalyticsDashboardResponse as AnalyticsDashboardResponseContract,
  DailyTrendItem as DailyTrendItemContract,
  LiveFeedEntryItem as LiveFeedEntryItemContract,
  MonthlyTrendItem as MonthlyTrendItemContract,
} from '@shou/types/contracts';

export class DailyTrendItemSwagger implements DailyTrendItemContract {
  @ApiProperty({ description: '日期', example: '2026-04-11' })
  day!: string;

  @ApiProperty({ description: '当日应收（元）', example: 1280 })
  receivableAmount!: number;

  @ApiProperty({ description: '当日实收（元）', example: 980 })
  receivedAmount!: number;
}

export class MonthlyTrendItemSwagger implements MonthlyTrendItemContract {
  @ApiProperty({ description: '月份', example: '2026-04' })
  month!: string;

  @ApiProperty({ description: '当月应收（元）', example: 51200 })
  receivableAmount!: number;

  @ApiProperty({ description: '当月实收（元）', example: 46000 })
  receivedAmount!: number;
}

export class LiveFeedEntryItemSwagger implements LiveFeedEntryItemContract {
  @ApiProperty({ description: '时间', example: '2026-04-11T09:00:00.000Z' })
  time!: string;

  @ApiProperty({ description: '客户名称', example: '深圳华强贸易' })
  customer!: string;

  @ApiProperty({ description: '金额（元）', example: 198.5 })
  amount!: number;

  @ApiProperty({ description: '状态文案', example: '支付成功' })
  status!: string;
}

export class AnalyticsDashboardResponseSwagger implements AnalyticsDashboardResponseContract {
  @ApiProperty({ description: '今日应收（元）', example: 1280 })
  todayReceivable!: number;

  @ApiProperty({ description: '今日实收（元）', example: 980 })
  todayReceived!: number;

  @ApiProperty({ description: '今日待收（元）', example: 300 })
  todayPending!: number;

  @ApiProperty({ description: '回款率', example: 76.56 })
  collectionRate!: number;

  @ApiProperty({ description: '待打印数量', example: 5 })
  pendingPrintCount!: number;

  @ApiProperty({ description: '即将到期账期单数', example: 3 })
  creditDueSoonCount!: number;

  @ApiProperty({ description: '部分回款订单数', example: 2 })
  partialPaymentCount!: number;

  @ApiProperty({ description: '角色标题', example: '老板视角' })
  roleTitle!: string;
}
