import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AnalyticsDashboardResponse, DailyTrendItem, LiveFeedEntryItem, MonthlyTrendItem } from '@shou/types/contracts';
import { TenantPermissionCodeEnum } from '@shou/types/enums';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../authorization/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { AnalyticsRangeQueryDto } from './dto/analytics-range.query.dto';
import { ReportService } from './report.service';
import { AnalyticsDashboardResponseSwagger, DailyTrendItemSwagger, LiveFeedEntryItemSwagger, MonthlyTrendItemSwagger } from './report.swagger';

@ApiTags('Analytics')
@ApiBearerAuth()
@ApiExtraModels(DailyTrendItemSwagger, MonthlyTrendItemSwagger, LiveFeedEntryItemSwagger, AnalyticsDashboardResponseSwagger)
@Controller('analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @ApiOperation({ summary: '获取每日收款趋势' })
  @ApiOkResponse({ type: [DailyTrendItemSwagger] })
  @Get('daily-trend')
  @Permissions(TenantPermissionCodeEnum.ANALYTICS_READ)
  async getDailyTrend(@CurrentUser() currentUser: JwtPayload): Promise<DailyTrendItem[]> {
    return this.reportService.getDailyTrend(currentUser);
  }

  @ApiOperation({ summary: '获取月度收款趋势' })
  @ApiOkResponse({ type: [MonthlyTrendItemSwagger] })
  @Get('monthly-trend')
  @Permissions(TenantPermissionCodeEnum.ANALYTICS_READ)
  async getMonthlyTrend(@CurrentUser() currentUser: JwtPayload, @Query() query: AnalyticsRangeQueryDto): Promise<MonthlyTrendItem[]> {
    return this.reportService.getMonthlyTrend(currentUser, query.months);
  }

  @ApiOperation({ summary: '获取实时收款动态' })
  @ApiOkResponse({ type: [LiveFeedEntryItemSwagger] })
  @Get('payments/live')
  @Permissions(TenantPermissionCodeEnum.ANALYTICS_READ)
  async getLivePayments(@CurrentUser() currentUser: JwtPayload): Promise<LiveFeedEntryItem[]> {
    return this.reportService.getLivePayments(currentUser);
  }

  @ApiOperation({ summary: '获取首页仪表盘指标' })
  @ApiOkResponse({ type: AnalyticsDashboardResponseSwagger })
  @Get('dashboard')
  @Permissions(TenantPermissionCodeEnum.ANALYTICS_READ)
  async getDashboard(@CurrentUser() currentUser: JwtPayload): Promise<AnalyticsDashboardResponse> {
    return this.reportService.getDashboard(currentUser);
  }
}
