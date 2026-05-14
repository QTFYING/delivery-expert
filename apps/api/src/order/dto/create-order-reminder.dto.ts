import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateOrderReminderDto {
  @ApiPropertyOptional({
    description: '发送渠道列表；不传则由服务端按默认策略处理',
    type: [String],
    example: ['sms', 'wechat'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  channels?: string[];
}
