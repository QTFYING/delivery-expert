import { Body, Controller, Get, Ip, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRoleEnum } from '@shou/types/enums';
import type { TenantCertificationStatusResult, TenantCertificationSubmitRequest, TenantCertificationSubmitResponse } from '@shou/types/contracts';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateTenantCertificationDto } from './dto/create-tenant-certification.dto';
import { TenantCertificationService } from './tenant-certification.service';
import { TenantCertificationStatusResultSwagger, TenantCertificationSubmitResponseSwagger } from './tenant.swagger';

@ApiTags('Tenant Certification')
@ApiBearerAuth()
@ApiExtraModels(TenantCertificationSubmitResponseSwagger, TenantCertificationStatusResultSwagger)
@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TenantCertificationController {
  constructor(private readonly tenantCertificationService: TenantCertificationService) {}

  @ApiOperation({ summary: '提交当前租户资质材料' })
  @ApiOkResponse({ type: TenantCertificationSubmitResponseSwagger })
  @Post('certification')
  @Roles(UserRoleEnum.TENANT_OWNER)
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
  @Roles(UserRoleEnum.TENANT_OWNER)
  async getCertificationStatus(@CurrentUser() currentUser: JwtPayload): Promise<TenantCertificationStatusResult> {
    return this.tenantCertificationService.getCertificationStatus(currentUser);
  }
}
