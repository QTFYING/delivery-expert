import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { PaginatedResponse } from '@shou/types/common';
import type {
  CreateOrderReceiptRequest,
  CreateOrderReceiptResponse,
  CreateOrderReminderRequest,
  CreateOrderReminderResponse,
  CreditOrderItem,
} from '@shou/types/contracts';
import { UserRoleEnum } from '@shou/types/enums';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateOrderReceiptDto } from './dto/create-order-receipt.dto';
import { CreateOrderReminderDto } from './dto/create-order-reminder.dto';
import { ListCreditOrdersQueryDto } from './dto/list-credit-orders.query.dto';
import { OrderFinanceService } from './order-finance.service';
import { CreateOrderReceiptResponseSwagger, CreateOrderReminderResponseSwagger, CreditOrderListResponseSwagger } from './order.swagger';

@ApiTags('Orders')
@ApiBearerAuth()
@ApiExtraModels(CreditOrderListResponseSwagger, CreateOrderReminderResponseSwagger, CreateOrderReceiptResponseSwagger)
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrderFinanceController {
  constructor(private readonly orderFinanceService: OrderFinanceService) {}

  // 获取账期订单列表，面向租户账期管理视图。
  @ApiOperation({ summary: '获取账期订单列表' })
  @ApiOkResponse({ type: CreditOrderListResponseSwagger })
  @Get('credit')
  @Roles(UserRoleEnum.TENANT_OWNER, UserRoleEnum.TENANT_FINANCE)
  async getCreditOrders(
    @CurrentUser() currentUser: JwtPayload,
    @Query() query: ListCreditOrdersQueryDto,
  ): Promise<PaginatedResponse<CreditOrderItem>> {
    return this.orderFinanceService.getCreditOrders(currentUser, query.page, query.pageSize);
  }

  // 创建催款提醒记录，并由 finance service 收口通知渠道语义。
  @ApiOperation({ summary: '创建催款提醒记录' })
  @ApiParam({ name: 'id', description: '订单 ID' })
  @ApiOkResponse({ type: CreateOrderReminderResponseSwagger })
  @Post(':id/reminders')
  @Roles(UserRoleEnum.TENANT_OWNER, UserRoleEnum.TENANT_FINANCE)
  async createReminder(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') id: string,
    @Body() request: CreateOrderReminderDto,
  ): Promise<CreateOrderReminderResponse> {
    return this.orderFinanceService.createReminder(currentUser, id, request as CreateOrderReminderRequest);
  }

  // 创建内部收款记录，保持金额与订单状态推进在 service 内处理。
  @ApiOperation({ summary: '创建内部收款记录' })
  @ApiParam({ name: 'id', description: '订单 ID' })
  @ApiOkResponse({ type: CreateOrderReceiptResponseSwagger })
  @Post(':id/receipts')
  @Roles(UserRoleEnum.TENANT_OWNER, UserRoleEnum.TENANT_FINANCE)
  async createReceipt(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') id: string,
    @Body() request: CreateOrderReceiptDto,
  ): Promise<CreateOrderReceiptResponse> {
    return this.orderFinanceService.createReceipt(currentUser, id, request as CreateOrderReceiptRequest);
  }
}
