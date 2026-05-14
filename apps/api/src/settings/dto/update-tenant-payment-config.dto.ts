import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class UpdateTenantPaymentConfigDto {
  @ApiProperty({
    description: '渠道专属黑盒配置；lakala 使用 merchantNo / terminalNo，其他渠道按渠道适配进度保存',
    type: 'object',
    additionalProperties: true,
    example: { merchantNo: '8222900533118A3', terminalNo: '001' },
  })
  @IsObject()
  config!: Record<string, unknown>;
}
