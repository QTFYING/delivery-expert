import {
  OrderPayTypeEnum as PrismaOrderPayTypeEnum,
  OrderStatusEnum as PrismaOrderStatusEnum,
  PrintRecordResultEnum as PrismaPrintRecordResultEnum,
} from '@prisma/client';
import {
  OrderPayTypeEnum,
  OrderStatusEnum,
  PrintRecordResultEnum,
  type OrderPayType,
  type OrderStatus,
  type PrintRecordResult,
} from '@shou/types/enums';

const ORDER_STATUS_TO_PRISMA: Record<OrderStatus, PrismaOrderStatusEnum> = {
  [OrderStatusEnum.PENDING]: PrismaOrderStatusEnum.PENDING,
  [OrderStatusEnum.PARTIAL]: PrismaOrderStatusEnum.PARTIAL,
  [OrderStatusEnum.PAID]: PrismaOrderStatusEnum.PAID,
  [OrderStatusEnum.EXPIRED]: PrismaOrderStatusEnum.EXPIRED,
  [OrderStatusEnum.CREDIT]: PrismaOrderStatusEnum.CREDIT,
};

const PRISMA_TO_ORDER_STATUS: Record<PrismaOrderStatusEnum, OrderStatus> = {
  [PrismaOrderStatusEnum.PENDING]: OrderStatusEnum.PENDING,
  [PrismaOrderStatusEnum.PARTIAL]: OrderStatusEnum.PARTIAL,
  [PrismaOrderStatusEnum.PAID]: OrderStatusEnum.PAID,
  [PrismaOrderStatusEnum.EXPIRED]: OrderStatusEnum.EXPIRED,
  [PrismaOrderStatusEnum.CREDIT]: OrderStatusEnum.CREDIT,
};

const ORDER_PAY_TYPE_TO_PRISMA: Record<OrderPayType, PrismaOrderPayTypeEnum> = {
  [OrderPayTypeEnum.CASH]: PrismaOrderPayTypeEnum.CASH,
  [OrderPayTypeEnum.CREDIT]: PrismaOrderPayTypeEnum.CREDIT,
};

const PRISMA_TO_ORDER_PAY_TYPE: Record<PrismaOrderPayTypeEnum, OrderPayType> = {
  [PrismaOrderPayTypeEnum.CASH]: OrderPayTypeEnum.CASH,
  [PrismaOrderPayTypeEnum.CREDIT]: OrderPayTypeEnum.CREDIT,
};

const PRINT_RECORD_RESULT_TO_PRISMA: Record<PrintRecordResult, PrismaPrintRecordResultEnum> = {
  [PrintRecordResultEnum.SUCCESS]: PrismaPrintRecordResultEnum.SUCCESS,
  [PrintRecordResultEnum.FAILED]: PrismaPrintRecordResultEnum.FAILED,
};

const PRISMA_TO_PRINT_RECORD_RESULT: Record<PrismaPrintRecordResultEnum, PrintRecordResult> = {
  [PrismaPrintRecordResultEnum.SUCCESS]: PrintRecordResultEnum.SUCCESS,
  [PrismaPrintRecordResultEnum.FAILED]: PrintRecordResultEnum.FAILED,
};

export function toPrismaOrderStatus(status: OrderStatus): PrismaOrderStatusEnum {
  return ORDER_STATUS_TO_PRISMA[status] ?? PrismaOrderStatusEnum.PENDING;
}

export function fromPrismaOrderStatus(status: PrismaOrderStatusEnum): OrderStatus {
  return PRISMA_TO_ORDER_STATUS[status] ?? OrderStatusEnum.PENDING;
}

export function toPrismaOrderPayType(payType: OrderPayType): PrismaOrderPayTypeEnum {
  return ORDER_PAY_TYPE_TO_PRISMA[payType] ?? PrismaOrderPayTypeEnum.CASH;
}

export function fromPrismaOrderPayType(payType: PrismaOrderPayTypeEnum): OrderPayType {
  return PRISMA_TO_ORDER_PAY_TYPE[payType] ?? OrderPayTypeEnum.CASH;
}

export function toPrismaPrintRecordResult(result: PrintRecordResult): PrismaPrintRecordResultEnum {
  return PRINT_RECORD_RESULT_TO_PRISMA[result] ?? PrismaPrintRecordResultEnum.SUCCESS;
}

export function fromPrismaPrintRecordResult(result: PrismaPrintRecordResultEnum): PrintRecordResult {
  return PRISMA_TO_PRINT_RECORD_RESULT[result] ?? PrintRecordResultEnum.SUCCESS;
}
