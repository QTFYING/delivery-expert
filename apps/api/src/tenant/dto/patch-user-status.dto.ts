import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { UserStatusEnum } from '@shou/types/enums';

export class PatchUserStatusDto {
  @ApiProperty({ description: '用户状态', enum: Object.values(UserStatusEnum), example: UserStatusEnum.DISABLED })
  @IsEnum(UserStatusEnum)
  status!: (typeof UserStatusEnum)[keyof typeof UserStatusEnum];
}
