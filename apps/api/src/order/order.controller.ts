import { Body, Controller, Get, Param, Patch, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiParam, ApiProduces, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { TenantPermissionCodeEnum, UserRoleEnum } from '@shou/types/enums';
import type { Response } from 'express';
import type { PaginatedResponse } from '@shou/types/common';
import type {
  AdminOrderItem,
  CreateOrderRequest,
  OrderExportQuery,
  TenantOrderItem,
  TenantOrderListItem,
  UpdateOrderRequest,
  VoidOrderRequest,
} from '@shou/types/contracts';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../authorization/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { BurstLimit } from '../common/decorators/burst-limit.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { ExportOrdersQueryDto } from './dto/export-orders.query.dto';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { VoidOrderDto } from './dto/void-order.dto';
import { OrderExportService } from './order-export.service';
import { OrderService } from './order.service';
import { AdminOrderItemSwagger, AdminOrderListResponseSwagger, TenantOrderItemSwagger, TenantOrderListResponseSwagger } from './order.swagger';

@ApiTags('Orders')
@ApiBearerAuth()
@ApiExtraModels(TenantOrderItemSwagger, AdminOrderItemSwagger, TenantOrderListResponseSwagger, AdminOrderListResponseSwagger)
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly orderExportService: OrderExportService,
  ) {}

  // 获取订单列表
  @ApiOperation({ summary: '获取订单列表' })
  @ApiOkResponse({
    schema: {
      oneOf: [{ $ref: getSchemaPath(TenantOrderListResponseSwagger) }, { $ref: getSchemaPath(AdminOrderListResponseSwagger) }],
    },
  })
  @Get()
  @BurstLimit()
  @Roles(UserRoleEnum.OS_SUPER_ADMIN)
  @Permissions(TenantPermissionCodeEnum.ORDERS_READ)
  async findAll(
    @CurrentUser() currentUser: JwtPayload,
    @Query() query: ListOrdersQueryDto,
  ): Promise<PaginatedResponse<TenantOrderListItem | AdminOrderItem>> {
    return this.orderService.findAll(currentUser, query);
  }

  // 导出订单为 Excel（必须声明在 :id 路由之前，避免 export 被当作订单 ID）
  // 流式写出，service 直接接管 response 写文件头与文件流，故用非 passthrough 的 @Res
  @ApiOperation({ summary: '导出订单' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOkResponse({ description: '导出成功，返回 xlsx 文件流', schema: { type: 'string', format: 'binary' } })
  @Get('export')
  @Permissions(TenantPermissionCodeEnum.ORDERS_READ)
  async export(@CurrentUser() currentUser: JwtPayload, @Query() query: ExportOrdersQueryDto, @Res() response: Response): Promise<void> {
    await this.orderExportService.streamOrders(currentUser, query as OrderExportQuery, response);
  }

  // 获取订单详情
  @ApiOperation({ summary: '获取订单详情' })
  @ApiParam({ name: 'id', description: '订单 ID' })
  @ApiOkResponse({
    schema: {
      oneOf: [{ $ref: getSchemaPath(TenantOrderItemSwagger) }, { $ref: getSchemaPath(AdminOrderItemSwagger) }],
    },
  })
  @Get(':id')
  @Roles(UserRoleEnum.OS_SUPER_ADMIN)
  @Permissions(TenantPermissionCodeEnum.ORDERS_READ)
  async getOrder(@Param('id') id: string, @CurrentUser() currentUser: JwtPayload): Promise<TenantOrderItem | AdminOrderItem> {
    return this.orderService.getOrder(id, currentUser);
  }

  // 创建订单
  @ApiOperation({ summary: '创建订单' })
  @ApiOkResponse({ type: TenantOrderItemSwagger })
  @Post()
  @Permissions(TenantPermissionCodeEnum.ORDERS_MANAGE)
  async createOrder(@CurrentUser() currentUser: JwtPayload, @Body() request: CreateOrderDto): Promise<TenantOrderItem> {
    return this.orderService.createOrder(currentUser, request as CreateOrderRequest);
  }

  // 更新订单
  @ApiOperation({ summary: '更新订单' })
  @ApiParam({ name: 'id', description: '订单 ID' })
  @ApiOkResponse({ type: TenantOrderItemSwagger })
  @Put(':id')
  @Permissions(TenantPermissionCodeEnum.ORDERS_MANAGE)
  async updateOrder(@CurrentUser() currentUser: JwtPayload, @Param('id') id: string, @Body() request: UpdateOrderDto): Promise<TenantOrderItem> {
    return this.orderService.updateOrder(currentUser, id, request as UpdateOrderRequest);
  }

  // 作废订单
  @ApiOperation({ summary: '更新订单作废状态' })
  @ApiParam({ name: 'id', description: '订单 ID' })
  @ApiOkResponse({ type: TenantOrderItemSwagger })
  @Patch(':id')
  @Permissions(TenantPermissionCodeEnum.ORDERS_MANAGE)
  async voidOrder(@CurrentUser() currentUser: JwtPayload, @Param('id') id: string, @Body() request: VoidOrderDto): Promise<TenantOrderItem> {
    return this.orderService.voidOrder(currentUser, id, request as VoidOrderRequest);
  }
}
