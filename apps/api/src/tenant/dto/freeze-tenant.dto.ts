import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class FreezeTenantDto {
  @ApiProperty({ description: '冻结原因', example: '到期未续费' })
  @IsString()
  @MaxLength(255)
  reason!: string;
}
