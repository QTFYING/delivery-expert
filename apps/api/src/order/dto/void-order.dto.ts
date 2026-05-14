import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VoidOrderDto {
  @ApiProperty({ description: '作废原因', example: '客户取消订单' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  voidReason!: string;
}
