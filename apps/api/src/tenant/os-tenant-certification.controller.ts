import { Body, Controller, Get, Ip, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRoleEnum } from '@shou/types/enums';
import type {
  CreateTenantCertificationReviewDecisionRequest,
  TenantCertificationRecordItem,
  TenantCertificationReviewDecisionResponse,
} from '@shou/types/contracts';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateTenantCertificationReviewDecisionDto } from './dto/create-tenant-certification-review-decision.dto';
import { OsTenantCertificationService } from './os-tenant-certification.service';
import { TenantCertificationRecordItemSwagger, TenantCertificationReviewDecisionResponseSwagger } from './tenant.swagger';

@ApiTags('Admin Tenants')
@ApiBearerAuth()
@ApiExtraModels(TenantCertificationRecordItemSwagger, TenantCertificationReviewDecisionResponseSwagger)
@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OsTenantCertificationController {
  constructor(private readonly osTenantCertificationService: OsTenantCertificationService) {}

  // 获取资质审核队列
  @ApiOperation({ summary: '获取资质审核队列' })
  @ApiOkResponse({ type: [TenantCertificationRecordItemSwagger] })
  @Get('certifications')
  @Roles(UserRoleEnum.OS_SUPER_ADMIN)
  async getCertificationQueue(): Promise<TenantCertificationRecordItem[]> {
    return this.osTenantCertificationService.getCertificationQueue();
  }

  // 创建资质审核决议
  @ApiOperation({ summary: '创建资质审核决议' })
  @ApiParam({ name: 'id', description: '资质记录 ID' })
  @ApiOkResponse({ type: TenantCertificationReviewDecisionResponseSwagger })
  @Post('certifications/:id/review-decisions')
  @Roles(UserRoleEnum.OS_SUPER_ADMIN)
  async createCertificationReviewDecision(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') certificationId: string,
    @Body() request: CreateTenantCertificationReviewDecisionDto,
    @Ip() ip: string,
  ): Promise<TenantCertificationReviewDecisionResponse> {
    return this.osTenantCertificationService.createCertificationReviewDecision(
      currentUser,
      certificationId,
      request as CreateTenantCertificationReviewDecisionRequest,
      ip,
    );
  }
}
