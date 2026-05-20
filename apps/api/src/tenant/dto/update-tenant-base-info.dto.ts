import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Matches, MaxLength } from 'class-validator';
import { TenantSoftwareVersionEnum } from '@shou/types/enums';

export class UpdateTenantBaseInfoDto {
  @ApiProperty({ description: '租户名称', example: '华南一区商户A' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ description: '联系地址', example: '河南省郑州市金水区经三路 88 号' })
  @IsString()
  @MaxLength(255)
  address!: string;

  @ApiProperty({ description: '统一社会信用代码', example: '91440300MA5FXXXXXX' })
  @IsString()
  @MaxLength(100)
  licenseNo!: string;

  @ApiProperty({ description: '租户采购的软件版本级别', enum: Object.values(TenantSoftwareVersionEnum), example: TenantSoftwareVersionEnum.L2 })
  @IsEnum(TenantSoftwareVersionEnum)
  softwareVersion!: (typeof TenantSoftwareVersionEnum)[keyof typeof TenantSoftwareVersionEnum];

  @ApiProperty({ description: '租户采购服务到期日期，前端按 YYYY-MM-DD 提交', example: '2027-05-13' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'serviceExpireAt 必须是 YYYY-MM-DD 日期格式' })
  serviceExpireAt!: string;
}
