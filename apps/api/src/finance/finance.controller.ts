import { Controller, Get, Header, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { TenantPermissionCodeEnum, UserRoleEnum } from '@shou/types/enums';
import type {
  AdminReconciliationDailyRecordItem,
  AdminReconciliationSummaryResponse,
  FinanceReconciliationRecordItem,
  FinanceSummaryResponse,
} from '@shou/types/contracts';
import type { PaginatedResponse } from '@shou/types/common';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../authorization/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { ListReconciliationQueryDto } from './dto/list-reconciliation.query.dto';
import { FinanceService } from './finance.service';
import {
  AdminReconciliationDailyListResponseSwagger,
  AdminReconciliationSummaryResponseSwagger,
  FinanceReconciliationListResponseSwagger,
  FinanceSummaryResponseSwagger,
} from './finance.swagger';

@ApiTags('Tenant Finance')
@ApiBearerAuth()
@ApiExtraModels(FinanceSummaryResponseSwagger, FinanceReconciliationListResponseSwagger)
@Controller('finance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantFinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @ApiOperation({ summary: '获取财务汇总' })
  @ApiOkResponse({ type: FinanceSummaryResponseSwagger })
  @Get('summary')
  @Permissions(TenantPermissionCodeEnum.FINANCE_READ)
  async getSummary(@CurrentUser() currentUser: JwtPayload): Promise<FinanceSummaryResponse> {
    return this.financeService.getTenantSummary(currentUser);
  }

  @ApiOperation({ summary: '获取租户对账明细' })
  @ApiOkResponse({ type: FinanceReconciliationListResponseSwagger })
  @Get('reconciliation')
  @Permissions(TenantPermissionCodeEnum.FINANCE_READ)
  async getReconciliation(
    @CurrentUser() currentUser: JwtPayload,
    @Query() query: ListReconciliationQueryDto,
  ): Promise<PaginatedResponse<FinanceReconciliationRecordItem>> {
    return this.financeService.getTenantReconciliation(currentUser, query.page, query.pageSize);
  }

  @ApiOperation({ summary: '导出租户对账单' })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: '导出成功，返回文件流', schema: { type: 'string', format: 'binary' } })
  @Get('reconciliation/export')
  @Header('Content-Type', 'application/octet-stream')
  @Permissions(TenantPermissionCodeEnum.FINANCE_EXPORT)
  async exportReconciliation(@CurrentUser() currentUser: JwtPayload, @Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    const file = await this.financeService.exportTenantReconciliation(currentUser);
    response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    return new StreamableFile(Buffer.from(file.content, 'utf-8'));
  }
}

@ApiTags('Admin Reconciliation')
@ApiBearerAuth()
@ApiExtraModels(AdminReconciliationSummaryResponseSwagger, AdminReconciliationDailyListResponseSwagger)
@Controller('reconciliation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminReconciliationController {
  constructor(private readonly financeService: FinanceService) {}

  @ApiOperation({ summary: '获取平台对账汇总' })
  @ApiOkResponse({ type: AdminReconciliationSummaryResponseSwagger })
  @Get('summary')
  @Roles(UserRoleEnum.OS_SUPER_ADMIN)
  async getSummary(): Promise<AdminReconciliationSummaryResponse> {
    return this.financeService.getAdminSummary();
  }

  @ApiOperation({ summary: '获取平台对账日报明细' })
  @ApiOkResponse({ type: AdminReconciliationDailyListResponseSwagger })
  @Get('daily')
  @Roles(UserRoleEnum.OS_SUPER_ADMIN)
  async getDaily(@Query() query: ListReconciliationQueryDto): Promise<PaginatedResponse<AdminReconciliationDailyRecordItem>> {
    return this.financeService.getAdminDaily(query.page, query.pageSize);
  }

  @ApiOperation({ summary: '导出平台对账单' })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: '导出成功，返回文件流', schema: { type: 'string', format: 'binary' } })
  @Get('export')
  @Header('Content-Type', 'application/octet-stream')
  @Roles(UserRoleEnum.OS_SUPER_ADMIN)
  async export(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    const file = await this.financeService.exportAdminReconciliation();
    response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    return new StreamableFile(Buffer.from(file.content, 'utf-8'));
  }
}
