import { Controller, Get, Param, Post, Query, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  CreatePrintingTemplatePackageCopyRequest,
  CreatePrintingTemplatePackageCopyResponse,
  ErpVendorOption,
  PrintingTemplatePackageDetail,
  PrintingTemplatePackageListItem,
} from '@shou/types/contracts';
import { TenantPermissionCodeEnum } from '@shou/types/enums';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Permissions } from '../authorization/permissions.decorator';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { PrintingTemplatePackageService } from './printing-template-package.service';

@ApiTags('Settings - 打印模板包库')
@ApiBearerAuth()
@Controller('settings/printing/template-packages')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PrintingTemplatePackageTenantController {
  constructor(private readonly packageService: PrintingTemplatePackageService) {}

  /** 获取 ERP 标签选项 */
  @Get('erp-vendors')
  @ApiOperation({ summary: '获取 ERP 适配标签选项' })
  @Permissions(TenantPermissionCodeEnum.PRINTING_CONFIG_READ)
  getErpVendorOptions(): ErpVendorOption[] {
    return this.packageService.getErpVendorOptions();
  }

  /** 获取已发布官方模板包列表 */
  @Get()
  @ApiOperation({ summary: '获取官方模板包列表' })
  @Permissions(TenantPermissionCodeEnum.PRINTING_CONFIG_READ)
  async getPackageList(
    @Query('erpVendor') erpVendor?: string,
  ): Promise<PrintingTemplatePackageListItem[]> {
    return this.packageService.getPublishedPackageList({ erpVendor });
  }

  /** 获取模板包详情 */
  @Get(':packageId')
  @ApiOperation({ summary: '获取官方模板包详情' })
  @Permissions(TenantPermissionCodeEnum.PRINTING_CONFIG_READ)
  async getPackageDetail(@Param('packageId') packageId: string): Promise<PrintingTemplatePackageDetail> {
    return this.packageService.getPublishedPackageDetail(packageId);
  }

  /** 创建模板包副本 */
  @Post(':packageId/copies')
  @ApiOperation({ summary: '基于官方模板包创建租户副本' })
  @Permissions(TenantPermissionCodeEnum.TEMPLATES_MANAGE, TenantPermissionCodeEnum.PRINTING_CONFIG_UPDATE)
  async createPackageCopy(
    @CurrentUser() currentUser: JwtPayload,
    @Param('packageId') packageId: string,
    @Body() request: CreatePrintingTemplatePackageCopyRequest,
  ): Promise<CreatePrintingTemplatePackageCopyResponse> {
    return this.packageService.createPackageCopy(currentUser, packageId, request);
  }
}
