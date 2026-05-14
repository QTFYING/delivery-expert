import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class UpdatePrintingConfigDto {
  @ApiPropertyOptional({ description: '配置版本号，预留并发控制', example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  configVersion?: number;

  @ApiProperty({
    description: '打印配置 JSON 黑盒快照',
    type: 'object',
    additionalProperties: true,
    example: { page: { width: 210, height: 297 }, fields: [{ key: 'customer', x: 20, y: 30 }] },
  })
  @IsObject()
  config!: Record<string, unknown>;

  @ApiPropertyOptional({ description: '备注', example: '适配饮品送货单' })
  @IsOptional()
  @IsString()
  remark?: string;
}
