import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOfflinePaymentVerificationDto {
  @ApiPropertyOptional({ description: '财务确认备注', example: '已核对到账' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}
