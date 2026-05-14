import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class CreateTenantStatusChangeBatchDto {
  @ApiProperty({ description: '租户 ID 列表', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];

  @ApiProperty({ description: '批量冻结原因', example: '批量停用' })
  @IsString()
  reason!: string;
}
