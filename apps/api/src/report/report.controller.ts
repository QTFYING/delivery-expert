import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AnalyticsDashboardResponse, DailyTrendItem, LiveFeedEntryItem, MonthlyTrendItem } from '@shou/types/contracts';
import { UserRoleEnum } from '@shou/types/enums';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AnalyticsRangeQueryDto } from './dto/analytics-range.query.dto';
import { ReportService } from './report.service';
import { AnalyticsDashboardResponseSwagger, DailyTrendItemSwagger, LiveFeedEntryItemSwagger, MonthlyTrendItemSwagger } from './report.swagger';

@ApiTags('Analytics')
@ApiBearerAuth()
@ApiExtraModels(DailyTrendItemSwagger, MonthlyTrendItemSwagger, LiveFeedEntryItemSwagger, AnalyticsDashboardResponseSwagger)
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @ApiOperation({ summary: '获取每日收款趋势' })
  @ApiOkResponse({ type: [DailyTrendItemSwagger] })
  @Get('daily-trend')
  @Roles(UserRoleEnum.TENANT_OWNER, UserRoleEnum.TENANT_OPERATOR, UserRoleEnum.TENANT_FINANCE, UserRoleEnum.TENANT_VIEWER)
  async getDailyTrend(@CurrentUser() currentUser: JwtPayload): Promise<DailyTrendItem[]> {
    return this.reportService.getDailyTrend(currentUser);
  }

  @ApiOperation({ summary: '获取月度收款趋势' })
  @ApiOkResponse({ type: [MonthlyTrendItemSwagger] })
  @Get('monthly-trend')
  @Roles(UserRoleEnum.TENANT_OWNER, UserRoleEnum.TENANT_OPERATOR, UserRoleEnum.TENANT_FINANCE, UserRoleEnum.TENANT_VIEWER)
  async getMonthlyTrend(@CurrentUser() currentUser: JwtPayload, @Query() query: AnalyticsRangeQueryDto): Promise<MonthlyTrendItem[]> {
    return this.reportService.getMonthlyTrend(currentUser, query.months);
  }

  @ApiOperation({ summary: '获取实时收款动态' })
  @ApiOkResponse({ type: [LiveFeedEntryItemSwagger] })
  @Get('payments/live')
  @Roles(UserRoleEnum.TENANT_OWNER, UserRoleEnum.TENANT_OPERATOR, UserRoleEnum.TENANT_FINANCE, UserRoleEnum.TENANT_VIEWER)
  async getLivePayments(@CurrentUser() currentUser: JwtPayload): Promise<LiveFeedEntryItem[]> {
    return this.reportService.getLivePayments(currentUser);
  }

  @ApiOperation({ summary: '获取首页仪表盘指标' })
  @ApiOkResponse({ type: AnalyticsDashboardResponseSwagger })
  @Get('dashboard')
  @Roles(UserRoleEnum.TENANT_OWNER, UserRoleEnum.TENANT_OPERATOR, UserRoleEnum.TENANT_FINANCE, UserRoleEnum.TENANT_VIEWER)
  async getDashboard(@CurrentUser() currentUser: JwtPayload): Promise<AnalyticsDashboardResponse> {
    return this.reportService.getDashboard(currentUser);
  }
}
