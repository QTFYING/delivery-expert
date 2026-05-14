import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type {
  OrderImportJobResponse,
  OrderImportPreviewRequest,
  OrderImportPreviewResponse,
  OrderImportSubmitRequest,
  OrderImportSubmitResponse,
} from '@shou/types/contracts';
import { UserRoleEnum } from '@shou/types/enums';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ImportPreviewDto } from './dto/import-preview.dto';
import { SubmitOrderImportDto } from './dto/submit-order-import.dto';
import { ImportJobQueryService } from './import-job-query.service';
import { ImportPreviewService } from './import-preview.service';
import { ImportSubmitService } from './import-submit.service';
import { OrderImportJobResponseSwagger, OrderImportPreviewResponseSwagger, OrderImportSubmitResponseSwagger } from './import.swagger';

@ApiTags('Import')
@ApiBearerAuth()
@ApiExtraModels(OrderImportPreviewResponseSwagger, OrderImportSubmitResponseSwagger, OrderImportJobResponseSwagger)
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ImportJobController {
  constructor(
    private readonly previewService: ImportPreviewService,
    private readonly submitService: ImportSubmitService,
    private readonly jobQueryService: ImportJobQueryService,
  ) {}

  // 执行导入预检，请求解析和响应转发在 controller，预检快照与校验逻辑在 service 收口
  @ApiOperation({ summary: '导入预检' })
  @ApiOkResponse({ type: OrderImportPreviewResponseSwagger })
  @Post('import/preview')
  @Roles(UserRoleEnum.TENANT_OWNER, UserRoleEnum.TENANT_OPERATOR)
  async previewImport(@CurrentUser() currentUser: JwtPayload, @Body() request: ImportPreviewDto): Promise<OrderImportPreviewResponse> {
    return this.previewService.previewImport(currentUser, request as OrderImportPreviewRequest);
  }

  // 消费预检批次创建正式导入任务，controller 不承载任务状态判断和建单逻辑
  @ApiOperation({ summary: '正式导入订单' })
  @ApiOkResponse({ type: OrderImportSubmitResponseSwagger })
  @Post('orders/import')
  @Roles(UserRoleEnum.TENANT_OWNER, UserRoleEnum.TENANT_OPERATOR)
  async submitOrderImport(@CurrentUser() currentUser: JwtPayload, @Body() request: SubmitOrderImportDto): Promise<OrderImportSubmitResponse> {
    return this.submitService.submitOrderImport(currentUser, request as OrderImportSubmitRequest);
  }

  // 查询租户侧导入任务进度，任务结果投影与租户边界控制由 service 负责
  @ApiOperation({ summary: '查询导入任务进度' })
  @ApiParam({ name: 'jobId', description: '导入任务 ID' })
  @ApiOkResponse({ type: OrderImportJobResponseSwagger })
  @Get('orders/import/jobs/:jobId')
  @Roles(UserRoleEnum.TENANT_OWNER, UserRoleEnum.TENANT_OPERATOR)
  async getImportJob(@CurrentUser() currentUser: JwtPayload, @Param('jobId') jobId: string): Promise<OrderImportJobResponse> {
    return this.jobQueryService.getImportJob(currentUser, jobId);
  }
}
