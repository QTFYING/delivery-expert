import { Body, Controller, Delete, Get, Ip, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type {
  GetTenantPaymentConfigListResponse,
  PermissionNode,
  TenantAuditLogListResponse,
  GetPrintingConfigDetailResponse,
  GetPrintingConfigListResponse,
  TenantPaymentConfigSnapshot,
  TenantRoleAccount,
  TenantSettingsUser,
  TenantGeneralSettings,
  TenantUserStatusUpdateRequest,
  CreateTenantUserRequest,
  UpdateTenantGeneralSettingsRequest,
  UpdatePrintingConfigRequest,
  UpdatePrintingConfigResponse,
  UpsertTenantPaymentConfigRequest,
  UpdateTenantUserRequest,
} from '@shou/types/contracts';
import { PaymentChannelEnum, UserRoleEnum, type PaymentChannel } from '@shou/types/enums';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateTenantUserDto } from './dto/create-tenant-user.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs.query.dto';
import { PatchTenantUserStatusDto } from './dto/patch-tenant-user-status.dto';
import { UpdateGeneralSettingsDto } from './dto/update-general-settings.dto';
import { UpdatePrintingConfigDto } from './dto/update-printing-config.dto';
import { UpdateTenantPaymentConfigDto } from './dto/update-tenant-payment-config.dto';
import { UpdateTenantUserDto } from './dto/update-tenant-user.dto';
import { SettingsPaymentConfigService } from './settings-payment-config.service';
import { SettingsPrintingService } from './settings-printing.service';
import { SettingsUserService } from './settings-user.service';
import { SettingsUserPasswordService } from './settings-user-password.service';
import { SettingsService } from './settings.service';
import {
  GetPrintingConfigDetailResponseSwagger,
  GetPrintingConfigListResponseSwagger,
  GetTenantPaymentConfigListResponseSwagger,
  PermissionNodeSwagger,
  TenantAuditLogListResponseSwagger,
  TenantGeneralSettingsSwagger,
  TenantPaymentConfigSnapshotSwagger,
  TenantRoleAccountSwagger,
  TenantSettingsUserSwagger,
  UpdatePrintingConfigResponseSwagger,
} from './settings.swagger';

@ApiTags('Tenant Settings')
@ApiBearerAuth()
@ApiExtraModels(
  TenantGeneralSettingsSwagger,
  TenantRoleAccountSwagger,
  PermissionNodeSwagger,
  TenantSettingsUserSwagger,
  TenantPaymentConfigSnapshotSwagger,
  GetTenantPaymentConfigListResponseSwagger,
  GetPrintingConfigListResponseSwagger,
  GetPrintingConfigDetailResponseSwagger,
  UpdatePrintingConfigResponseSwagger,
  TenantAuditLogListResponseSwagger,
)
@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly settingsUserService: SettingsUserService,
    private readonly settingsUserPasswordService: SettingsUserPasswordService,
    private readonly settingsPaymentConfigService: SettingsPaymentConfigService,
    private readonly settingsPrintingService: SettingsPrintingService,
  ) {}

  /** 获取租户通用配置 */
  @ApiOperation({ summary: '获取通用配置' })
  @ApiOkResponse({ type: TenantGeneralSettingsSwagger })
  @Get('general')
  @Roles(UserRoleEnum.TENANT_OWNER)
  async getGeneralSettings(@CurrentUser() currentUser: JwtPayload): Promise<TenantGeneralSettings> {
    return this.settingsService.getGeneralSettings(currentUser);
  }

  /** 保存租户通知与业务偏好配置，不修改企业主体资料 */
  @ApiOperation({ summary: '保存通用配置' })
  @ApiOkResponse({ type: TenantGeneralSettingsSwagger })
  @Put('general')
  @Roles(UserRoleEnum.TENANT_OWNER)
  async updateGeneralSettings(
    @CurrentUser() currentUser: JwtPayload,
    @Body() request: UpdateGeneralSettingsDto,
    @Ip() ip: string,
  ): Promise<TenantGeneralSettings> {
    return this.settingsService.updateGeneralSettings(currentUser, request as UpdateTenantGeneralSettingsRequest, ip);
  }

  /** 获取租户支付渠道配置列表 */
  @ApiOperation({ summary: '获取支付渠道配置列表' })
  @ApiOkResponse({ type: GetTenantPaymentConfigListResponseSwagger })
  @Get('payment-configs')
  @Roles(UserRoleEnum.TENANT_OWNER)
  async getPaymentConfigList(@CurrentUser() currentUser: JwtPayload): Promise<GetTenantPaymentConfigListResponse> {
    return this.settingsPaymentConfigService.getPaymentConfigList(currentUser);
  }

  /** 获取单个支付渠道配置详情 */
  @ApiOperation({ summary: '获取支付渠道配置详情' })
  @ApiParam({ name: 'channel', description: '支付渠道', enum: Object.values(PaymentChannelEnum), example: PaymentChannelEnum.LAKALA })
  @ApiOkResponse({ type: TenantPaymentConfigSnapshotSwagger })
  @Get('payment-configs/:channel')
  @Roles(UserRoleEnum.TENANT_OWNER)
  async getPaymentConfigDetail(
    @CurrentUser() currentUser: JwtPayload,
    @Param('channel') channel: PaymentChannel,
  ): Promise<TenantPaymentConfigSnapshot> {
    return this.settingsPaymentConfigService.getPaymentConfigDetail(currentUser, channel);
  }

  /** 保存单个支付渠道配置 */
  @ApiOperation({ summary: '保存支付渠道配置' })
  @ApiParam({ name: 'channel', description: '支付渠道', enum: Object.values(PaymentChannelEnum), example: PaymentChannelEnum.LAKALA })
  @ApiOkResponse({ type: TenantPaymentConfigSnapshotSwagger })
  @Put('payment-configs/:channel')
  @Roles(UserRoleEnum.TENANT_OWNER)
  async updatePaymentConfig(
    @CurrentUser() currentUser: JwtPayload,
    @Param('channel') channel: PaymentChannel,
    @Body() request: UpdateTenantPaymentConfigDto,
  ): Promise<TenantPaymentConfigSnapshot> {
    const payload: UpsertTenantPaymentConfigRequest = {
      config: request.config as unknown as Record<string, unknown>,
    };

    return this.settingsPaymentConfigService.upsertPaymentConfig(currentUser, channel, payload);
  }

  /** 停用单个支付渠道配置 */
  @ApiOperation({ summary: '停用支付渠道配置' })
  @ApiParam({ name: 'channel', description: '支付渠道', enum: Object.values(PaymentChannelEnum), example: PaymentChannelEnum.LAKALA })
  @ApiOkResponse({ type: TenantPaymentConfigSnapshotSwagger })
  @Post('payment-configs/:channel/disable')
  @Roles(UserRoleEnum.TENANT_OWNER)
  async disablePaymentConfig(
    @CurrentUser() currentUser: JwtPayload,
    @Param('channel') channel: PaymentChannel,
    @Ip() ip: string,
  ): Promise<TenantPaymentConfigSnapshot> {
    return this.settingsPaymentConfigService.disablePaymentConfig(currentUser, channel, ip);
  }

  /** 切换当前生效支付渠道 */
  @ApiOperation({ summary: '切换当前生效支付渠道' })
  @ApiParam({ name: 'channel', description: '支付渠道', enum: Object.values(PaymentChannelEnum), example: PaymentChannelEnum.LAKALA })
  @ApiOkResponse({ type: TenantPaymentConfigSnapshotSwagger })
  @Post('payment-configs/:channel/activate')
  @Roles(UserRoleEnum.TENANT_OWNER)
  async activatePaymentConfig(
    @CurrentUser() currentUser: JwtPayload,
    @Param('channel') channel: PaymentChannel,
    @Ip() ip: string,
  ): Promise<TenantPaymentConfigSnapshot> {
    return this.settingsPaymentConfigService.activatePaymentConfig(currentUser, channel, ip);
  }

  /** 获取租户角色列表 */
  @ApiOperation({ summary: '获取角色列表' })
  @ApiOkResponse({ type: [TenantRoleAccountSwagger] })
  @Get('roles')
  @Roles(UserRoleEnum.TENANT_OWNER)
  async getRoles(@CurrentUser() currentUser: JwtPayload): Promise<TenantRoleAccount[]> {
    return this.settingsUserService.getRoles(currentUser);
  }

  /** 获取租户权限树 */
  @ApiOperation({ summary: '获取权限树' })
  @ApiOkResponse({ type: [PermissionNodeSwagger] })
  @Get('permissions')
  @Roles(UserRoleEnum.TENANT_OWNER)
  async getPermissions(): Promise<PermissionNode[]> {
    return this.settingsService.getPermissions();
  }

  /** 获取租户用户列表 */
  @ApiOperation({ summary: '获取租户用户列表' })
  @ApiOkResponse({ type: [TenantSettingsUserSwagger] })
  @Get('users')
  @Roles(UserRoleEnum.TENANT_OWNER)
  async getUsers(@CurrentUser() currentUser: JwtPayload): Promise<TenantSettingsUser[]> {
    return this.settingsUserService.getUsers(currentUser);
  }

  /** 创建租户用户 */
  @ApiOperation({ summary: '创建租户用户' })
  @ApiOkResponse({ type: TenantSettingsUserSwagger })
  @Post('users')
  @Roles(UserRoleEnum.TENANT_OWNER)
  async createUser(@CurrentUser() currentUser: JwtPayload, @Body() request: CreateTenantUserDto, @Ip() ip: string): Promise<TenantSettingsUser> {
    return this.settingsUserService.createUser(currentUser, request as CreateTenantUserRequest, ip);
  }

  /** 更新租户用户 */
  @ApiOperation({ summary: '更新租户用户' })
  @ApiParam({ name: 'id', description: '用户 ID', format: 'uuid' })
  @ApiOkResponse({ type: TenantSettingsUserSwagger })
  @Put('users/:id')
  @Roles(UserRoleEnum.TENANT_OWNER)
  async updateUser(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id', new ParseUUIDPipe()) userId: string,
    @Body() request: UpdateTenantUserDto,
    @Ip() ip: string,
  ): Promise<TenantSettingsUser> {
    return this.settingsUserService.updateUser(currentUser, userId, request as UpdateTenantUserRequest, ip);
  }

  /** 删除租户用户 */
  @ApiOperation({ summary: '删除租户用户' })
  @ApiParam({ name: 'id', description: '用户 ID', format: 'uuid' })
  @ApiOkResponse({ description: '删除成功', schema: { type: 'null' } })
  @Delete('users/:id')
  @Roles(UserRoleEnum.TENANT_OWNER)
  async deleteUser(@CurrentUser() currentUser: JwtPayload, @Param('id', new ParseUUIDPipe()) userId: string, @Ip() ip: string): Promise<null> {
    return this.settingsUserService.deleteUser(currentUser, userId, ip);
  }

  /** 更新租户用户状态 */
  @ApiOperation({ summary: '更新租户用户状态' })
  @ApiParam({ name: 'id', description: '用户 ID', format: 'uuid' })
  @ApiOkResponse({ type: TenantSettingsUserSwagger })
  @Patch('users/:id')
  @Roles(UserRoleEnum.TENANT_OWNER)
  async patchUserStatus(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id', new ParseUUIDPipe()) userId: string,
    @Body() request: PatchTenantUserStatusDto,
    @Ip() ip: string,
  ): Promise<TenantSettingsUser> {
    return this.settingsUserService.patchUserStatus(currentUser, userId, request as TenantUserStatusUpdateRequest, ip);
  }

  /** 重置租户员工密码 */
  @ApiOperation({ summary: '重置租户员工密码' })
  @ApiParam({ name: 'id', description: '用户 ID', format: 'uuid' })
  @ApiOkResponse({ description: '重置成功', schema: { type: 'null' } })
  @Post('users/:id/password-resets')
  @Roles(UserRoleEnum.TENANT_OWNER)
  async resetUserPassword(@CurrentUser() currentUser: JwtPayload, @Param('id', new ParseUUIDPipe()) userId: string, @Ip() ip: string): Promise<null> {
    return this.settingsUserPasswordService.resetEmployeePassword(currentUser, userId, ip);
  }

  /** 获取打印配置列表 */
  @ApiOperation({ summary: '获取打印配置列表' })
  @ApiOkResponse({ type: GetPrintingConfigListResponseSwagger })
  @Get('printing')
  @Roles(UserRoleEnum.TENANT_OWNER)
  async getPrintingConfigList(@CurrentUser() currentUser: JwtPayload): Promise<GetPrintingConfigListResponse> {
    return this.settingsPrintingService.getPrintingConfigList(currentUser);
  }

  /** 获取单张映射模板打印配置 */
  @ApiOperation({ summary: '获取单张映射模板打印配置' })
  @ApiParam({ name: 'importTemplateId', description: '导入映射模板 ID' })
  @ApiOkResponse({ type: GetPrintingConfigDetailResponseSwagger })
  @Get('printing/:importTemplateId')
  @Roles(UserRoleEnum.TENANT_OWNER)
  async getPrintingConfigDetail(
    @CurrentUser() currentUser: JwtPayload,
    @Param('importTemplateId') importTemplateId: string,
  ): Promise<GetPrintingConfigDetailResponse> {
    return this.settingsPrintingService.getPrintingConfigDetail(currentUser, importTemplateId);
  }

  /** 保存单张映射模板打印配置 */
  @ApiOperation({ summary: '保存单张映射模板打印配置' })
  @ApiParam({ name: 'importTemplateId', description: '导入映射模板 ID' })
  @ApiOkResponse({ type: UpdatePrintingConfigResponseSwagger })
  @Put('printing/:importTemplateId')
  @Roles(UserRoleEnum.TENANT_OWNER)
  async updatePrintingConfig(
    @CurrentUser() currentUser: JwtPayload,
    @Param('importTemplateId') importTemplateId: string,
    @Body() request: UpdatePrintingConfigDto,
    @Ip() ip: string,
  ): Promise<UpdatePrintingConfigResponse> {
    return this.settingsPrintingService.updatePrintingConfig(currentUser, importTemplateId, request as UpdatePrintingConfigRequest, ip);
  }

  /** 获取租户操作日志 */
  @ApiOperation({ summary: '获取租户操作日志' })
  @ApiOkResponse({ type: TenantAuditLogListResponseSwagger })
  @Get('audit-logs')
  @Roles(UserRoleEnum.TENANT_OWNER)
  async getAuditLogs(@CurrentUser() currentUser: JwtPayload, @Query() query: ListAuditLogsQueryDto): Promise<TenantAuditLogListResponse> {
    return this.settingsService.getAuditLogs(currentUser, query);
  }
}
