import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateGeneralSettingsDto {
  @ApiPropertyOptional({ description: '订单可支付有效期（单位：天）', example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qrCodeExpiry?: number;

  @ApiPropertyOptional({ description: '是否通知业务员', example: true })
  @IsOptional()
  @IsBoolean()
  notifySeller?: boolean;

  @ApiPropertyOptional({ description: '是否通知老板', example: true })
  @IsOptional()
  @IsBoolean()
  notifyOwner?: boolean;

  @ApiPropertyOptional({ description: '是否通知财务', example: true })
  @IsOptional()
  @IsBoolean()
  notifyFinance?: boolean;

  @ApiPropertyOptional({ description: '账期提醒提前天数', example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  creditRemindDays?: number;

  @ApiPropertyOptional({ description: '是否推送每日收款日报', example: true })
  @IsOptional()
  @IsBoolean()
  dailyReportPush?: boolean;
}
