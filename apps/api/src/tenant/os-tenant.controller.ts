import { Body, Controller, Get, Ip, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PaymentChannelEnum, UserRoleEnum, type PaymentChannel } from '@shou/types/enums';
import type {
  CreateTenantAuditBatchRequest,
  CreateTenantAuditDecisionRequest,
  CreateTenantRequest,
  CreateTenantStatusChangeBatchRequest,
  CreateTenantRenewalRequest,
  PatchTenantStatusRequest,
  TenantPaymentConfigListItem,
  TenantPaymentConfigSnapshot,
  TenantBatchActionResponse,
  TenantAuditDecisionResponse,
  TenantListQuery,
  TenantMemberItem,
  TenantMemberListQuery,
  TenantRecordItem,
  TenantRenewalResponse,
  TenantStatusMutationResponse,
} from '@shou/types/contracts';
import type { PaginatedResponse } from '@shou/types/common';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateTenantAuditBatchDto } from './dto/create-tenant-audit-batch.dto';
import { CreateTenantAuditDecisionDto } from './dto/create-tenant-audit-decision.dto';
import { CreateOsTenantDto } from './dto/create-os-tenant.dto';
import { CreateTenantRenewalDto } from './dto/create-tenant-renewal.dto';
import { CreateTenantStatusChangeBatchDto } from './dto/create-tenant-status-change-batch.dto';
import { ListTenantMembersQueryDto } from './dto/list-tenant-members.query.dto';
import { ListTenantsQueryDto } from './dto/list-tenants.query.dto';
import { OsTenantLifecycleService } from './os-tenant-lifecycle.service';
import { OsTenantPaymentConfigService } from './os-tenant-payment-config.service';
import { OsTenantQueryService } from './os-tenant-query.service';
import { PatchTenantStatusDto } from './dto/patch-tenant-status.dto';
import { ListTenantPaymentConfigsQueryDto } from './dto/list-tenant-payment-configs.query.dto';
import { TenantPaymentConfigSnapshotSwagger } from '../settings/settings.swagger';
import {
  TenantAuditDecisionResponseSwagger,
  TenantBatchActionResponseSwagger,
  TenantListResponseSwagger,
  TenantMemberListResponseSwagger,
  TenantPaymentConfigListResponseSwagger,
  TenantRecordItemSwagger,
  TenantRenewalResponseSwagger,
  TenantStatusMutationResponseSwagger,
} from './tenant.swagger';

@ApiTags('Admin Tenants')
@ApiBearerAuth()
@ApiExtraModels(
  TenantListResponseSwagger,
  TenantRecordItemSwagger,
  TenantAuditDecisionResponseSwagger,
  TenantBatchActionResponseSwagger,
  TenantRenewalResponseSwagger,
  TenantStatusMutationResponseSwagger,
  TenantMemberListResponseSwagger,
  TenantPaymentConfigListResponseSwagger,
  TenantPaymentConfigSnapshotSwagger,
)
@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OsTenantController {
  constructor(
    private readonly osTenantQueryService: OsTenantQueryService,
    private readonly osTenantLifecycleService: OsTenantLifecycleService,
    private readonly osTenantPaymentConfigService: OsTenantPaymentConfigService,
  ) {}

  // 获取租户列表。
  @ApiOperation({ summary: '获取租户列表' })
  @ApiOkResponse({ type: TenantListResponseSwagger })
  @Get()
  @Roles(UserRoleEnum.OS_SUPER_ADMIN)
  async getTenants(@Query() query: ListTenantsQueryDto): Promise<PaginatedResponse<TenantRecordItem>> {
    return this.osTenantQueryService.getTenants(query as TenantListQuery);
  }

  // 创建租户。
  @ApiOperation({ summary: '创建租户' })
  @ApiOkResponse({ type: TenantRecordItemSwagger })
  @Post()
  @Roles(UserRoleEnum.OS_SUPER_ADMIN)
  async createTenant(@CurrentUser() currentUser: JwtPayload, @Body() request: CreateOsTenantDto, @Ip() ip: string): Promise<TenantRecordItem> {
    return this.osTenantLifecycleService.createAdminTenant(currentUser, request as CreateTenantRequest, ip);
  }

  // 创建租户审核决议。
  @ApiOperation({ summary: '创建租户审核决议' })
  @ApiParam({ name: 'id', description: '租户 ID' })
  @ApiOkResponse({ type: TenantAuditDecisionResponseSwagger })
  @Post(':id/audit-decisions')
  @Roles(UserRoleEnum.OS_SUPER_ADMIN)
  async createAuditDecision(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') tenantId: string,
    @Body() request: CreateTenantAuditDecisionDto,
    @Ip() ip: string,
  ): Promise<TenantAuditDecisionResponse> {
    return this.osTenantLifecycleService.createTenantAuditDecision(currentUser, tenantId, request as CreateTenantAuditDecisionRequest, ip);
  }

  // 创建租户批量审核批次。
  @ApiOperation({ summary: '创建租户批量审核批次' })
  @ApiOkResponse({ type: TenantBatchActionResponseSwagger })
  @Post('audit-batches')
  @Roles(UserRoleEnum.OS_SUPER_ADMIN)
  async createAuditBatch(
    @CurrentUser() currentUser: JwtPayload,
    @Body() request: CreateTenantAuditBatchDto,
    @Ip() ip: string,
  ): Promise<TenantBatchActionResponse> {
    return this.osTenantLifecycleService.createTenantAuditBatch(currentUser, request as CreateTenantAuditBatchRequest, ip);
  }

  // 创建租户续费记录。
  @ApiOperation({ summary: '创建租户续费记录' })
  @ApiParam({ name: 'id', description: '租户 ID' })
  @ApiOkResponse({ type: TenantRenewalResponseSwagger })
  @Post(':id/renewals')
  @Roles(UserRoleEnum.OS_SUPER_ADMIN)
  async createRenewal(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') tenantId: string,
    @Body() request: CreateTenantRenewalDto,
    @Ip() ip: string,
  ): Promise<TenantRenewalResponse> {
    return this.osTenantLifecycleService.createTenantRenewal(currentUser, tenantId, request as CreateTenantRenewalRequest, ip);
  }

  // 更新租户状态。
  @ApiOperation({ summary: '更新租户状态' })
  @ApiParam({ name: 'id', description: '租户 ID' })
  @ApiOkResponse({ type: TenantStatusMutationResponseSwagger })
  @Patch(':id')
  @Roles(UserRoleEnum.OS_SUPER_ADMIN)
  async patchStatus(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') tenantId: string,
    @Body() request: PatchTenantStatusDto,
    @Ip() ip: string,
  ): Promise<TenantStatusMutationResponse> {
    return this.osTenantLifecycleService.patchTenantStatus(currentUser, tenantId, request as PatchTenantStatusRequest, ip);
  }

  // 创建租户批量状态变更批次。
  @ApiOperation({ summary: '创建租户批量状态变更批次' })
  @ApiOkResponse({ type: TenantBatchActionResponseSwagger })
  @Post('status-change-batches')
  @Roles(UserRoleEnum.OS_SUPER_ADMIN)
  async createStatusChangeBatch(
    @CurrentUser() currentUser: JwtPayload,
    @Body() request: CreateTenantStatusChangeBatchDto,
    @Ip() ip: string,
  ): Promise<TenantBatchActionResponse> {
    return this.osTenantLifecycleService.createTenantStatusChangeBatch(currentUser, request as CreateTenantStatusChangeBatchRequest, ip);
  }

  // 获取组织架构成员列表。
  @ApiOperation({ summary: '获取组织架构成员列表' })
  @ApiOkResponse({ type: TenantMemberListResponseSwagger })
  @Get('members')
  @Roles(UserRoleEnum.OS_SUPER_ADMIN)
  async getMembers(@Query() query: ListTenantMembersQueryDto): Promise<PaginatedResponse<TenantMemberItem>> {
    return this.osTenantQueryService.getTenantMembers(query as TenantMemberListQuery);
  }

  /** 平台侧分页获取租户支付渠道配置列表 */
  @ApiOperation({ summary: '获取租户支付渠道配置列表' })
  @ApiOkResponse({ type: TenantPaymentConfigListResponseSwagger })
  @Get('payment-configs')
  @Roles(UserRoleEnum.OS_SUPER_ADMIN)
  async getPaymentConfigs(@Query() query: ListTenantPaymentConfigsQueryDto): Promise<PaginatedResponse<TenantPaymentConfigListItem>> {
    return this.osTenantPaymentConfigService.getPaymentConfigs(query);
  }

  /** 平台侧获取单租户单渠道配置详情 */
  @ApiOperation({ summary: '获取单租户单渠道配置详情' })
  @ApiParam({ name: 'id', description: '租户 ID' })
  @ApiParam({ name: 'channel', description: '支付渠道', enum: Object.values(PaymentChannelEnum), example: PaymentChannelEnum.LAKALA })
  @ApiOkResponse({ type: TenantPaymentConfigSnapshotSwagger })
  @Get(':id/payment-configs/:channel')
  @Roles(UserRoleEnum.OS_SUPER_ADMIN)
  async getPaymentConfigDetail(@Param('id') tenantId: string, @Param('channel') channel: PaymentChannel): Promise<TenantPaymentConfigSnapshot> {
    return this.osTenantPaymentConfigService.getPaymentConfigDetail(tenantId, channel);
  }

  /** 平台侧强制停用单租户单渠道配置 */
  @ApiOperation({ summary: '强制停用单租户单渠道配置' })
  @ApiParam({ name: 'id', description: '租户 ID' })
  @ApiParam({ name: 'channel', description: '支付渠道', enum: Object.values(PaymentChannelEnum), example: PaymentChannelEnum.LAKALA })
  @ApiOkResponse({ type: TenantPaymentConfigSnapshotSwagger })
  @Post(':id/payment-configs/:channel/disable')
  @Roles(UserRoleEnum.OS_SUPER_ADMIN)
  async disablePaymentConfig(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') tenantId: string,
    @Param('channel') channel: PaymentChannel,
    @Ip() ip: string,
  ): Promise<TenantPaymentConfigSnapshot> {
    return this.osTenantPaymentConfigService.disablePaymentConfig(currentUser, tenantId, channel, ip);
  }

  /** 平台侧切换单租户当前生效支付渠道 */
  @ApiOperation({ summary: '切换单租户当前生效支付渠道' })
  @ApiParam({ name: 'id', description: '租户 ID' })
  @ApiParam({ name: 'channel', description: '支付渠道', enum: Object.values(PaymentChannelEnum), example: PaymentChannelEnum.LAKALA })
  @ApiOkResponse({ type: TenantPaymentConfigSnapshotSwagger })
  @Post(':id/payment-configs/:channel/activate')
  @Roles(UserRoleEnum.OS_SUPER_ADMIN)
  async activatePaymentConfig(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') tenantId: string,
    @Param('channel') channel: PaymentChannel,
    @Ip() ip: string,
  ): Promise<TenantPaymentConfigSnapshot> {
    return this.osTenantPaymentConfigService.activatePaymentConfig(currentUser, tenantId, channel, ip);
  }
}
