import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { FreezeActionEnum } from '@shou/types/enums';

export class PatchTenantStatusDto {
  @ApiProperty({ description: '状态动作', enum: Object.values(FreezeActionEnum), example: FreezeActionEnum.FREEZE })
  @IsEnum(FreezeActionEnum)
  action!: (typeof FreezeActionEnum)[keyof typeof FreezeActionEnum];

  @ApiPropertyOptional({ description: '原因', example: '到期未续费' })
  @IsOptional()
  @IsString()
  reason?: string;
}
