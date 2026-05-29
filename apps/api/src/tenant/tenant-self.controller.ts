import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantProfile } from '@shou/types/contracts';
import { TenantPermissionCodeEnum } from '@shou/types/enums';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../authorization/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { TenantService } from './tenant.service';
import { TenantProfileSwagger } from './tenant.swagger';

@ApiTags('Tenant Profile')
@ApiBearerAuth()
@ApiExtraModels(TenantProfileSwagger)
@Controller('tenant')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantSelfController {
  constructor(private readonly tenantService: TenantService) {}

  // 获取当前登录态所属租户的主体资料；用户资料仍由 /auth/me 表达
  @ApiOperation({ summary: '获取当前租户主体资料' })
  @ApiOkResponse({ type: TenantProfileSwagger })
  @Get('profile')
  @Permissions(TenantPermissionCodeEnum.TENANT_PROFILE_READ)
  async getTenantProfile(@CurrentUser() currentUser: JwtPayload): Promise<TenantProfile> {
    return this.tenantService.getTenantProfile(currentUser);
  }
}
