import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, Matches, Min } from 'class-validator';
import { TenantRenewPaymentMethodEnum, TenantSoftwareVersionEnum } from '@shou/types/enums';

export class CreateTenantRenewalDto {
  @ApiProperty({ description: '续费后生效的软件版本级别', enum: Object.values(TenantSoftwareVersionEnum), example: TenantSoftwareVersionEnum.L2 })
  @IsEnum(TenantSoftwareVersionEnum)
  softwareVersion!: (typeof TenantSoftwareVersionEnum)[keyof typeof TenantSoftwareVersionEnum];

  @ApiProperty({ description: '续费后生效的服务到期日期，前端按 YYYY-MM-DD 提交', example: '2027-05-13' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'serviceExpireAt 必须是 YYYY-MM-DD 日期格式' })
  serviceExpireAt!: string;

  @ApiProperty({ description: '续费金额（元）', example: 999 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty({
    description: '续费支付方式',
    enum: Object.values(TenantRenewPaymentMethodEnum),
    example: TenantRenewPaymentMethodEnum.BANK_TRANSFER,
  })
  @IsEnum(TenantRenewPaymentMethodEnum)
  paymentMethod!: (typeof TenantRenewPaymentMethodEnum)[keyof typeof TenantRenewPaymentMethodEnum];
}
