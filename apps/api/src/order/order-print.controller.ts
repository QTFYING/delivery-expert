import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type {
  CreateOrderPrintFailureRequest,
  CreateOrderPrintFailureResponse,
  OrderPrintRecordRequest,
  OrderPrintRecordResponse,
  OrderPrintRecordsResponse,
  TenantPrintRecordsResponse,
} from '@shou/types/contracts';
import { UserRoleEnum } from '@shou/types/enums';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateOrderPrintFailureDto } from './dto/create-order-print-failure.dto';
import { CreateOrderPrintRecordDto } from './dto/create-order-print-record.dto';
import { QueryOrderPrintRecordsDto, QueryTenantPrintRecordsDto } from './dto/query-order-print-records.dto';
import { OrderPrintQueryService } from './order-print-query.service';
import { OrderPrintService } from './order-print.service';
import {
  CreateOrderPrintFailureResponseSwagger,
  OrderPrintRecordResponseSwagger,
  OrderPrintRecordsResponseSwagger,
  TenantPrintRecordsResponseSwagger,
} from './order.swagger';

@ApiTags('Orders')
@ApiBearerAuth()
@ApiExtraModels(
  OrderPrintRecordResponseSwagger,
  CreateOrderPrintFailureResponseSwagger,
  OrderPrintRecordsResponseSwagger,
  TenantPrintRecordsResponseSwagger,
)
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrderPrintController {
  constructor(
    private readonly orderPrintService: OrderPrintService,
    private readonly orderPrintQueryService: OrderPrintQueryService,
  ) {}

  // 提交打印成功回执，记录实际打印成功的订单集合。
  @ApiOperation({ summary: '创建打印回执' })
  @ApiOkResponse({ type: OrderPrintRecordResponseSwagger })
  @Post('print-records')
  @Roles(UserRoleEnum.TENANT_OWNER, UserRoleEnum.TENANT_OPERATOR)
  async createPrintRecord(@CurrentUser() currentUser: JwtPayload, @Body() request: CreateOrderPrintRecordDto): Promise<OrderPrintRecordResponse> {
    return this.orderPrintService.createPrintRecord(currentUser, request as OrderPrintRecordRequest);
  }

  // 获取租户级跨订单打印追溯列表，仅提供只读审计视图。
  @ApiOperation({ summary: '跨订单打印事件追溯' })
  @ApiOkResponse({ type: TenantPrintRecordsResponseSwagger })
  @Get('print-records')
  @Roles(UserRoleEnum.TENANT_OWNER, UserRoleEnum.TENANT_FINANCE)
  async getTenantPrintRecords(
    @CurrentUser() currentUser: JwtPayload,
    @Query() query: QueryTenantPrintRecordsDto,
  ): Promise<TenantPrintRecordsResponse> {
    return this.orderPrintQueryService.getTenantPrintRecords(currentUser, query);
  }

  // 上报单订单打印失败记录，不影响订单打印成功计数。
  @ApiOperation({ summary: '上报打印失败记录' })
  @ApiParam({ name: 'id', description: '订单 ID' })
  @ApiOkResponse({ type: CreateOrderPrintFailureResponseSwagger })
  @Post(':id/print-failures')
  @Roles(UserRoleEnum.TENANT_OWNER, UserRoleEnum.TENANT_OPERATOR)
  async createPrintFailure(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') id: string,
    @Body() request: CreateOrderPrintFailureDto,
  ): Promise<CreateOrderPrintFailureResponse> {
    return this.orderPrintService.createPrintFailure(currentUser, id, request as CreateOrderPrintFailureRequest);
  }

  // 获取单订单打印历史，返回成功与失败事件时间线。
  @ApiOperation({ summary: '获取单订单打印历史' })
  @ApiParam({ name: 'id', description: '订单 ID' })
  @ApiOkResponse({ type: OrderPrintRecordsResponseSwagger })
  @Get(':id/print-records')
  @Roles(UserRoleEnum.TENANT_OWNER, UserRoleEnum.TENANT_OPERATOR, UserRoleEnum.TENANT_FINANCE, UserRoleEnum.TENANT_VIEWER)
  async getOrderPrintRecords(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') id: string,
    @Query() query: QueryOrderPrintRecordsDto,
  ): Promise<OrderPrintRecordsResponse> {
    return this.orderPrintQueryService.getOrderPrintRecords(currentUser, id, query);
  }
}
