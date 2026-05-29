import { Body, Controller, Get, Ip, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantPermissionCodeEnum } from '@shou/types/enums';
import type { TenantCertificationStatusResult, TenantCertificationSubmitRequest, TenantCertificationSubmitResponse } from '@shou/types/contracts';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../authorization/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { CreateTenantCertificationDto } from './dto/create-tenant-certification.dto';
import { TenantCertificationService } from './tenant-certification.service';
import { TenantCertificationStatusResultSwagger, TenantCertificationSubmitResponseSwagger } from './tenant.swagger';

@ApiTags('Tenant Certification')
@ApiBearerAuth()
@ApiExtraModels(TenantCertificationSubmitResponseSwagger, TenantCertificationStatusResultSwagger)
@Controller('tenants')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantCertificationController {
  constructor(private readonly tenantCertificationService: TenantCertificationService) {}

  @ApiOperation({ summary: '提交当前租户资质材料' })
  @ApiOkResponse({ type: TenantCertificationSubmitResponseSwagger })
  @Post('certification')
  @Permissions(TenantPermissionCodeEnum.TENANT_CERTIFICATION_MANAGE)
  async submitCertification(
    @CurrentUser() currentUser: JwtPayload,
    @Body() request: CreateTenantCertificationDto,
    @Ip() ip: string,
  ): Promise<TenantCertificationSubmitResponse> {
    return this.tenantCertificationService.submitCertification(currentUser, request as TenantCertificationSubmitRequest, ip);
  }

  @ApiOperation({ summary: '查询当前租户资质状态' })
  @ApiOkResponse({ type: TenantCertificationStatusResultSwagger })
  @Get('certification')
  @Permissions(TenantPermissionCodeEnum.TENANT_CERTIFICATION_MANAGE)
  async getCertificationStatus(@CurrentUser() currentUser: JwtPayload): Promise<TenantCertificationStatusResult> {
    return this.tenantCertificationService.getCertificationStatus(currentUser);
  }
}
