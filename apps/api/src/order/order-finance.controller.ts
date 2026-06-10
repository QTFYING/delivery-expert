import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type {
  CreateOrderReceiptRequest,
  CreateOrderReceiptResponse,
  CreateOrderReminderRequest,
  CreateOrderReminderResponse,
} from '@shou/types/contracts';
import { TenantPermissionCodeEnum } from '@shou/types/enums';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../authorization/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { CreateOrderReceiptDto } from './dto/create-order-receipt.dto';
import { CreateOrderReminderDto } from './dto/create-order-reminder.dto';
import { OrderFinanceService } from './order-finance.service';
import { CreateOrderReceiptResponseSwagger, CreateOrderReminderResponseSwagger } from './order.swagger';

@ApiTags('Orders')
@ApiBearerAuth()
@ApiExtraModels(CreateOrderReminderResponseSwagger, CreateOrderReceiptResponseSwagger)
@Controller('orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrderFinanceController {
  constructor(private readonly orderFinanceService: OrderFinanceService) {}

  // 创建催款提醒记录，并由 finance service 收口通知渠道语义
  @ApiOperation({ summary: '创建催款提醒记录' })
  @ApiParam({ name: 'id', description: '订单 ID' })
  @ApiOkResponse({ type: CreateOrderReminderResponseSwagger })
  @Post(':id/reminders')
  @Permissions(TenantPermissionCodeEnum.ORDERS_REMINDER_CREATE)
  async createReminder(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') id: string,
    @Body() request: CreateOrderReminderDto,
  ): Promise<CreateOrderReminderResponse> {
    return this.orderFinanceService.createReminder(currentUser, id, request as CreateOrderReminderRequest);
  }

  // 创建内部收款记录，保持金额与订单状态推进在 service 内处理
  @ApiOperation({ summary: '创建内部收款记录' })
  @ApiParam({ name: 'id', description: '订单 ID' })
  @ApiOkResponse({ type: CreateOrderReceiptResponseSwagger })
  @Post(':id/receipts')
  @Permissions(TenantPermissionCodeEnum.CREDIT_RECEIPT_CREATE)
  async createReceipt(
    @CurrentUser() currentUser: JwtPayload,
    @Param('id') id: string,
    @Body() request: CreateOrderReceiptDto,
  ): Promise<CreateOrderReceiptResponse> {
    return this.orderFinanceService.createReceipt(currentUser, id, request as CreateOrderReceiptRequest);
  }
}
