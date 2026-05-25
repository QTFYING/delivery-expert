import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type {
  CreateOrderImportTemplateRequest,
  OrderImportTemplate,
  OrderImportTemplateField,
  OrderImportTemplateMutationResponse,
  UpdateOrderImportTemplateRequest,
} from '@shou/types/contracts';
import { UserRoleEnum } from '@shou/types/enums';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateImportTemplateDto, UpdateImportTemplateDto } from './dto/import-template.dto';
import { ImportTemplateService } from './import-template.service';
import { OrderImportTemplateFieldSwagger, OrderImportTemplateMutationResponseSwagger, OrderImportTemplateSwagger } from './import.swagger';

@ApiTags('Import')
@ApiBearerAuth()
@ApiExtraModels(OrderImportTemplateFieldSwagger, OrderImportTemplateSwagger, OrderImportTemplateMutationResponseSwagger)
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ImportTemplateController {
  constructor(private readonly importTemplateService: ImportTemplateService) {}

  @ApiOperation({
    summary: '获取系统默认映射模板',
    description:
      '返回系统内置的 14 个标准字段，前 7 个为订单头字段（type: list），后 7 个为订单明细字段（type: line）。\n' +
      '- isRequired：控制模板创建/更新时 mapStr 是否必填；也用于前端 UI 展示（红星）\n' +
      '- isValueRequired：服务端 /preview 是否强制该列必须有值。前端可省略不传，服务端以系统定义为权威\n' +
      '- 订单明细 lineItems 至少需要 1 条，否则预检失败\n' +
      '创建/更新模板时：defaultFields 必须完整包含 14 个字段，label/isRequired 不可改写；mapStr 允许重复，不再做全局去重。',
  })
  @ApiOkResponse({
    type: [OrderImportTemplateFieldSwagger],
    description: '系统默认字段列表（共 14 项）',
    schema: {
      type: 'array',
      example: [
        { label: '源订单号', key: 'sourceOrderNo', mapStr: '', isRequired: true, isValueRequired: true, type: 'list' },
        { label: '客户名称', key: 'customer', mapStr: '', isRequired: true, isValueRequired: true, type: 'list' },
        { label: '客户电话', key: 'customerPhone', mapStr: '', isRequired: false, isValueRequired: false, type: 'list' },
        {
          label: '客户地址',
          key: 'customerAddress',
          mapStr: '',
          isRequired: false,
          isValueRequired: true,
          type: 'list',
        },
        { label: '总金额', key: 'totalAmount', mapStr: '', isRequired: false, isValueRequired: true, type: 'list' },
        { label: '下单时间', key: 'orderTime', mapStr: '', isRequired: true, isValueRequired: true, type: 'list' },
        { label: '结算方式', key: 'payType', mapStr: '', isRequired: false, isValueRequired: true, type: 'list' },
        { label: '品名', key: 'skuName', mapStr: '', isRequired: false, isValueRequired: false, type: 'line' },
        { label: '规格', key: 'skuSpec', mapStr: '', isRequired: false, isValueRequired: false, type: 'line' },
        { label: '单位', key: 'unit', mapStr: '', isRequired: false, isValueRequired: false, type: 'line' },
        { label: '数量', key: 'quantity', mapStr: '', isRequired: false, isValueRequired: false, type: 'line' },
        { label: '包装规格', key: 'packSpec', mapStr: '', isRequired: false, isValueRequired: false, type: 'line' },
        { label: '单价', key: 'unitPrice', mapStr: '', isRequired: false, isValueRequired: false, type: 'line' },
        { label: '金额', key: 'lineAmount', mapStr: '', isRequired: false, isValueRequired: false, type: 'line' },
      ],
    },
  })
  @Get('import/default-template')
  @Roles(UserRoleEnum.TENANT_OWNER)
  async getDefaultTemplate(): Promise<OrderImportTemplateField[]> {
    return this.importTemplateService.getDefaultTemplate();
  }

  // 查询当前租户可用的导入模板列表，不在 controller 中承载模板组装逻辑
  @ApiOperation({ summary: '获取导入模板列表' })
  @ApiOkResponse({ type: [OrderImportTemplateSwagger] })
  @Get('import/templates')
  @Roles(UserRoleEnum.TENANT_OWNER, UserRoleEnum.TENANT_OPERATOR)
  async getImportTemplates(@CurrentUser() currentUser: JwtPayload): Promise<OrderImportTemplate[]> {
    return this.importTemplateService.getImportTemplates(currentUser);
  }

  // 创建当前租户的订单导入模板，字段规范和默认模板约束由模板 service 收口
  @ApiOperation({ summary: '创建导入模板' })
  @ApiOkResponse({ type: OrderImportTemplateMutationResponseSwagger })
  @Post('import/templates')
  @Roles(UserRoleEnum.TENANT_OWNER)
  async createImportTemplate(
    @CurrentUser() currentUser: JwtPayload,
    @Body() request: CreateImportTemplateDto,
  ): Promise<OrderImportTemplateMutationResponse> {
    return this.importTemplateService.createImportTemplate(currentUser, request as CreateOrderImportTemplateRequest);
  }

  // 更新指定导入模板，controller 仅转发 HTTP 契约，模板校验与持久化由 service 负责
  @ApiOperation({ summary: '更新导入模板' })
  @ApiParam({ name: 'id', description: '导入模板 ID' })
  @ApiOkResponse({ type: OrderImportTemplateMutationResponseSwagger })
  @Put('import/templates/:id')
  @Roles(UserRoleEnum.TENANT_OWNER)
  async updateImportTemplate(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') id: string,
    @Body() request: UpdateImportTemplateDto,
  ): Promise<OrderImportTemplateMutationResponse> {
    return this.importTemplateService.updateImportTemplate(currentUser, id, request as UpdateOrderImportTemplateRequest);
  }
}
