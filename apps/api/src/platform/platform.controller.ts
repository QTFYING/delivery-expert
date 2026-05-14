import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRoleEnum } from '@shou/types/enums';
import type {
  ConsoleInfoResponse,
  DashboardMetricItem,
  LoginRiskEventItem,
  PlatformOverviewResponse,
  PlatformTodoItem,
  TenantHealthItem,
} from '@shou/types/contracts';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlatformOverviewService } from './platform-overview.service';
import { PlatformService } from './platform.service';
import {
  ConsoleInfoResponseSwagger,
  DashboardMetricItemSwagger,
  LoginRiskEventItemSwagger,
  PlatformOverviewResponseSwagger,
  PlatformTodoItemSwagger,
  TenantHealthItemSwagger,
} from './platform.swagger';

@ApiTags('Admin Platform')
@ApiBearerAuth()
@ApiExtraModels(
  ConsoleInfoResponseSwagger,
  DashboardMetricItemSwagger,
  PlatformTodoItemSwagger,
  TenantHealthItemSwagger,
  LoginRiskEventItemSwagger,
  PlatformOverviewResponseSwagger,
)
@Controller('platform')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRoleEnum.OS_SUPER_ADMIN)
export class PlatformController {
  constructor(
    private readonly platformService: PlatformService,
    private readonly platformOverviewService: PlatformOverviewService,
  ) {}

  @ApiOperation({ summary: '获取控制台上下文' })
  @ApiOkResponse({ type: ConsoleInfoResponseSwagger })
  @Get('console')
  async getConsoleInfo(@CurrentUser() currentUser: JwtPayload): Promise<ConsoleInfoResponse> {
    return this.platformService.getConsoleInfo(currentUser);
  }

  @ApiOperation({ summary: '获取平台核心指标' })
  @ApiOkResponse({ type: [DashboardMetricItemSwagger] })
  @Get('metrics')
  async getMetrics(@CurrentUser() currentUser: JwtPayload): Promise<DashboardMetricItem[]> {
    return this.platformService.getMetrics(currentUser);
  }

  @ApiOperation({ summary: '获取平台待办事项' })
  @ApiOkResponse({ type: [PlatformTodoItemSwagger] })
  @Get('todos')
  async getTodos(@CurrentUser() currentUser: JwtPayload): Promise<PlatformTodoItem[]> {
    return this.platformService.getTodos(currentUser);
  }

  @ApiOperation({ summary: '获取租户健康度' })
  @ApiOkResponse({ type: [TenantHealthItemSwagger] })
  @Get('tenant-health')
  async getTenantHealth(@CurrentUser() currentUser: JwtPayload): Promise<TenantHealthItem[]> {
    return this.platformOverviewService.getTenantHealth(currentUser);
  }

  @ApiOperation({ summary: '获取登录风险事件' })
  @ApiOkResponse({ type: [LoginRiskEventItemSwagger] })
  @Get('risk-events')
  async getRiskEvents(@CurrentUser() currentUser: JwtPayload): Promise<LoginRiskEventItem[]> {
    return this.platformService.getRiskEvents(currentUser);
  }

  @ApiOperation({ summary: '获取平台数据总览' })
  @ApiOkResponse({ type: PlatformOverviewResponseSwagger })
  @Get('overview')
  async getOverview(@CurrentUser() currentUser: JwtPayload): Promise<PlatformOverviewResponse> {
    return this.platformOverviewService.getOverview(currentUser);
  }
}
