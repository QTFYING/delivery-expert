import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { UserSimpleStatusEnum } from '@shou/types/enums';

export class PatchTenantUserStatusDto {
  @ApiProperty({
    description: '用户状态',
    enum: Object.values(UserSimpleStatusEnum),
    example: UserSimpleStatusEnum.DISABLED,
  })
  @IsEnum(UserSimpleStatusEnum)
  status!: (typeof UserSimpleStatusEnum)[keyof typeof UserSimpleStatusEnum];
}
