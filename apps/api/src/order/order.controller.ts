import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiParam, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { UserRoleEnum } from '@shou/types/enums';
import type { PaginatedResponse } from '@shou/types/common';
import type { AdminOrderItem, CreateOrderRequest, TenantOrderItem, UpdateOrderRequest, VoidOrderRequest } from '@shou/types/contracts';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { VoidOrderDto } from './dto/void-order.dto';
import { OrderService } from './order.service';
import { AdminOrderItemSwagger, AdminOrderListResponseSwagger, TenantOrderItemSwagger, TenantOrderListResponseSwagger } from './order.swagger';

@ApiTags('Orders')
@ApiBearerAuth()
@ApiExtraModels(TenantOrderItemSwagger, AdminOrderItemSwagger, TenantOrderListResponseSwagger, AdminOrderListResponseSwagger)
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  // 获取订单列表
  @ApiOperation({ summary: '获取订单列表' })
  @ApiOkResponse({
    schema: {
      oneOf: [{ $ref: getSchemaPath(TenantOrderListResponseSwagger) }, { $ref: getSchemaPath(AdminOrderListResponseSwagger) }],
    },
  })
  @Get()
  @Roles(
    UserRoleEnum.OS_SUPER_ADMIN,
    UserRoleEnum.TENANT_OWNER,
    UserRoleEnum.TENANT_OPERATOR,
    UserRoleEnum.TENANT_FINANCE,
    UserRoleEnum.TENANT_VIEWER,
  )
  async findAll(
    @CurrentUser() currentUser: JwtPayload,
    @Query() query: ListOrdersQueryDto,
  ): Promise<PaginatedResponse<TenantOrderItem | AdminOrderItem>> {
    return this.orderService.findAll(currentUser, query);
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
  @Roles(
    UserRoleEnum.OS_SUPER_ADMIN,
    UserRoleEnum.TENANT_OWNER,
    UserRoleEnum.TENANT_OPERATOR,
    UserRoleEnum.TENANT_FINANCE,
    UserRoleEnum.TENANT_VIEWER,
  )
  async getOrder(@Param('id') id: string, @CurrentUser() currentUser: JwtPayload): Promise<TenantOrderItem | AdminOrderItem> {
    return this.orderService.getOrder(id, currentUser);
  }

  // 创建订单
  @ApiOperation({ summary: '创建订单' })
  @ApiOkResponse({ type: TenantOrderItemSwagger })
  @Post()
  @Roles(UserRoleEnum.TENANT_OWNER, UserRoleEnum.TENANT_OPERATOR)
  async createOrder(@CurrentUser() currentUser: JwtPayload, @Body() request: CreateOrderDto): Promise<TenantOrderItem> {
    return this.orderService.createOrder(currentUser, request as CreateOrderRequest);
  }

  // 更新订单
  @ApiOperation({ summary: '更新订单' })
  @ApiParam({ name: 'id', description: '订单 ID' })
  @ApiOkResponse({ type: TenantOrderItemSwagger })
  @Put(':id')
  @Roles(UserRoleEnum.TENANT_OWNER, UserRoleEnum.TENANT_OPERATOR)
  async updateOrder(@CurrentUser() currentUser: JwtPayload, @Param('id') id: string, @Body() request: UpdateOrderDto): Promise<TenantOrderItem> {
    return this.orderService.updateOrder(currentUser, id, request as UpdateOrderRequest);
  }

  // 作废订单
  @ApiOperation({ summary: '更新订单作废状态' })
  @ApiParam({ name: 'id', description: '订单 ID' })
  @ApiOkResponse({ type: TenantOrderItemSwagger })
  @Patch(':id')
  @Roles(UserRoleEnum.TENANT_OWNER, UserRoleEnum.TENANT_OPERATOR)
  async voidOrder(@CurrentUser() currentUser: JwtPayload, @Param('id') id: string, @Body() request: VoidOrderDto): Promise<TenantOrderItem> {
    return this.orderService.voidOrder(currentUser, id, request as VoidOrderRequest);
  }
}
