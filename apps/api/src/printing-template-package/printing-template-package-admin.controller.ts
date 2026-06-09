import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  AdminPrintingTemplatePackageDetail,
  AdminPrintingTemplatePackageListResponse,
  CreatePrintingTemplatePackageDraftFromCandidateRequest,
  PrintingTemplateCandidateDetail,
  PrintingTemplateCandidateListResponse,
  UpdatePrintingTemplatePackageRequest,
} from '@shou/types/contracts';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PrintingTemplatePackageService } from './printing-template-package.service';

@ApiTags('Platform - 打印模板包库')
@ApiBearerAuth()
@Controller('platform/printing-template-packages')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OS_SUPER_ADMIN')
export class PrintingTemplatePackageAdminController {
  constructor(private readonly packageService: PrintingTemplatePackageService) {}

  // ---- 候选池 ----

  /** Admin 跨租户查看候选列表 */
  @Get('candidates')
  @ApiOperation({ summary: '获取租户打印配置候选列表' })
  async getCandidateList(@Query('erpVendor') erpVendor?: string): Promise<PrintingTemplateCandidateListResponse> {
    return this.packageService.getCandidateList({ erpVendor });
  }

  /** Admin 查看候选详情 */
  @Get('candidates/:printerTemplateId')
  @ApiOperation({ summary: '获取候选模板详情' })
  async getCandidateDetail(@Param('printerTemplateId') printerTemplateId: string): Promise<PrintingTemplateCandidateDetail> {
    return this.packageService.getCandidateDetail(printerTemplateId);
  }

  /** Admin 从候选创建模板包草稿 */
  @Post('candidates/:printerTemplateId/drafts')
  @ApiOperation({ summary: '从候选模板创建模板包草稿' })
  async createDraftFromCandidate(
    @CurrentUser() currentUser: JwtPayload,
    @Param('printerTemplateId') printerTemplateId: string,
    @Body() request: CreatePrintingTemplatePackageDraftFromCandidateRequest,
  ): Promise<AdminPrintingTemplatePackageDetail> {
    return this.packageService.createDraftFromCandidate(currentUser, printerTemplateId, request);
  }

  // ---- 模板包管理 ----

  /** Admin 模板包列表 */
  @Get()
  @ApiOperation({ summary: '获取模板包管理列表' })
  async getAdminPackageList(
    @Query('status') status?: string,
    @Query('erpVendor') erpVendor?: string,
  ): Promise<AdminPrintingTemplatePackageListResponse> {
    return this.packageService.getAdminPackageList({ status, erpVendor });
  }

  /** Admin 模板包详情 */
  @Get(':packageId')
  @ApiOperation({ summary: '获取模板包详情' })
  async getAdminPackageDetail(@Param('packageId') packageId: string): Promise<AdminPrintingTemplatePackageDetail> {
    return this.packageService.getAdminPackageDetail(packageId);
  }

  /** Admin 编辑模板包 */
  @Put(':packageId')
  @ApiOperation({ summary: '编辑模板包' })
  async updatePackage(
    @CurrentUser() currentUser: JwtPayload,
    @Param('packageId') packageId: string,
    @Body() request: UpdatePrintingTemplatePackageRequest,
  ): Promise<AdminPrintingTemplatePackageDetail> {
    return this.packageService.updatePackage(currentUser, packageId, request);
  }

  /** Admin 发布模板包 */
  @Post(':packageId/publish')
  @ApiOperation({ summary: '发布模板包' })
  async publishPackage(
    @CurrentUser() currentUser: JwtPayload,
    @Param('packageId') packageId: string,
  ): Promise<AdminPrintingTemplatePackageDetail> {
    return this.packageService.publishPackage(currentUser, packageId);
  }

  /** Admin 下线模板包 */
  @Post(':packageId/offline')
  @ApiOperation({ summary: '下线模板包' })
  async offlinePackage(
    @CurrentUser() currentUser: JwtPayload,
    @Param('packageId') packageId: string,
  ): Promise<AdminPrintingTemplatePackageDetail> {
    return this.packageService.offlinePackage(currentUser, packageId);
  }
}
