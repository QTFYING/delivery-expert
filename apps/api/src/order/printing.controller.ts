import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PaginatedResponse } from '@shou/types/common';
import type { PrintingOrderListItem, PrintingOrderListQuery } from '@shou/types/contracts';
import { TenantPermissionCodeEnum } from '@shou/types/enums';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../authorization/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { QueryPrintingOrdersDto } from './dto/query-printing-orders.dto';
import { PrintingOrderQueryService } from './printing-order-query.service';
import { PrintingOrderListResponseSwagger } from './order.swagger';

@ApiTags('Printing')
@ApiBearerAuth()
@ApiExtraModels(PrintingOrderListResponseSwagger)
@Controller('printing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PrintingController {
  constructor(private readonly printingOrderQueryService: PrintingOrderQueryService) {}

  // 获取打印中心轻量订单列表，仅返回打印工作台需要的订单摘要
  @ApiOperation({ summary: '获取打印中心订单列表' })
  @ApiOkResponse({ type: PrintingOrderListResponseSwagger })
  @Get('orders')
  @Permissions(TenantPermissionCodeEnum.ORDERS_PRINT_MANAGE)
  async getPrintingOrders(
    @CurrentUser() currentUser: JwtPayload,
    @Query() query: QueryPrintingOrdersDto,
  ): Promise<PaginatedResponse<PrintingOrderListItem>> {
    return this.printingOrderQueryService.findPrintingOrders(currentUser, query as PrintingOrderListQuery);
  }
}
