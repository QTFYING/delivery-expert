import {
  OrderCreditTypeEnum as PrismaOrderCreditTypeEnum,
  OrderPayTypeEnum as PrismaOrderPayTypeEnum,
  OrderStatusEnum as PrismaOrderStatusEnum,
  PrintRecordResultEnum as PrismaPrintRecordResultEnum,
} from '@prisma/client';
import {
  CreditTypeEnum,
  OrderPayTypeEnum,
  OrderStatusEnum,
  PrintRecordResultEnum,
  type CreditType,
  type OrderPayType,
  type OrderStatus,
  type PrintRecordResult,
} from '@shou/types/enums';

const ORDER_STATUS_TO_PRISMA: Record<OrderStatus, PrismaOrderStatusEnum> = {
  [OrderStatusEnum.PENDING]: PrismaOrderStatusEnum.PENDING,
  [OrderStatusEnum.PARTIAL]: PrismaOrderStatusEnum.PARTIAL,
  [OrderStatusEnum.PAID]: PrismaOrderStatusEnum.PAID,
  [OrderStatusEnum.EXPIRED]: PrismaOrderStatusEnum.EXPIRED,
  [OrderStatusEnum.VOIDED]: PrismaOrderStatusEnum.VOIDED,
};

const PRISMA_TO_ORDER_STATUS: Record<PrismaOrderStatusEnum, OrderStatus> = {
  [PrismaOrderStatusEnum.PENDING]: OrderStatusEnum.PENDING,
  [PrismaOrderStatusEnum.PARTIAL]: OrderStatusEnum.PARTIAL,
  [PrismaOrderStatusEnum.PAID]: OrderStatusEnum.PAID,
  [PrismaOrderStatusEnum.EXPIRED]: OrderStatusEnum.EXPIRED,
  [PrismaOrderStatusEnum.VOIDED]: OrderStatusEnum.VOIDED,
};

const ORDER_PAY_TYPE_TO_PRISMA: Record<OrderPayType, PrismaOrderPayTypeEnum> = {
  [OrderPayTypeEnum.CASH]: PrismaOrderPayTypeEnum.CASH,
  [OrderPayTypeEnum.CREDIT]: PrismaOrderPayTypeEnum.CREDIT,
};

const PRISMA_TO_ORDER_PAY_TYPE: Record<PrismaOrderPayTypeEnum, OrderPayType> = {
  [PrismaOrderPayTypeEnum.CASH]: OrderPayTypeEnum.CASH,
  [PrismaOrderPayTypeEnum.CREDIT]: OrderPayTypeEnum.CREDIT,
};

const CREDIT_TYPE_TO_PRISMA: Record<CreditType, PrismaOrderCreditTypeEnum> = {
  [CreditTypeEnum.MONTH]: PrismaOrderCreditTypeEnum.MONTH,
  [CreditTypeEnum.WEEK]: PrismaOrderCreditTypeEnum.WEEK,
  [CreditTypeEnum.PERIOD]: PrismaOrderCreditTypeEnum.PERIOD,
};

const PRISMA_TO_CREDIT_TYPE: Record<PrismaOrderCreditTypeEnum, CreditType> = {
  [PrismaOrderCreditTypeEnum.MONTH]: CreditTypeEnum.MONTH,
  [PrismaOrderCreditTypeEnum.WEEK]: CreditTypeEnum.WEEK,
  [PrismaOrderCreditTypeEnum.PERIOD]: CreditTypeEnum.PERIOD,
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

export function toPrismaOrderCreditType(creditType: CreditType): PrismaOrderCreditTypeEnum {
  return CREDIT_TYPE_TO_PRISMA[creditType] ?? PrismaOrderCreditTypeEnum.PERIOD;
}

export function fromPrismaOrderCreditType(creditType: PrismaOrderCreditTypeEnum | string | null | undefined): CreditType | null {
  if (!creditType) {
    return null;
  }

  const mapped = PRISMA_TO_CREDIT_TYPE[creditType as PrismaOrderCreditTypeEnum];
  if (mapped) {
    return mapped;
  }

  switch (String(creditType).toLowerCase()) {
    case CreditTypeEnum.MONTH:
      return CreditTypeEnum.MONTH;
    case CreditTypeEnum.WEEK:
      return CreditTypeEnum.WEEK;
    case CreditTypeEnum.PERIOD:
      return CreditTypeEnum.PERIOD;
    default:
      return null;
  }
}

export function toPrismaPrintRecordResult(result: PrintRecordResult): PrismaPrintRecordResultEnum {
  return PRINT_RECORD_RESULT_TO_PRISMA[result] ?? PrismaPrintRecordResultEnum.SUCCESS;
}

export function fromPrismaPrintRecordResult(result: PrismaPrintRecordResultEnum): PrintRecordResult {
  return PRISMA_TO_PRINT_RECORD_RESULT[result] ?? PrintRecordResultEnum.SUCCESS;
}
