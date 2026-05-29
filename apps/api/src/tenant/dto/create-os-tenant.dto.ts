import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { TenantSoftwareVersionEnum } from '@shou/types/enums';

export class CreateOsTenantDto {
  @ApiProperty({ description: '租户名称', example: '华南一区商户A' })
  @IsString()
  name!: string;

  @ApiProperty({ description: '租户采购的软件版本级别', enum: Object.values(TenantSoftwareVersionEnum), example: TenantSoftwareVersionEnum.L1 })
  @IsEnum(TenantSoftwareVersionEnum)
  softwareVersion!: (typeof TenantSoftwareVersionEnum)[keyof typeof TenantSoftwareVersionEnum];

  @ApiProperty({ description: '老板姓名', example: '张三' })
  @IsString()
  ownerName!: string;

  @ApiProperty({ description: '联系地址', example: '河南省郑州市金水区经三路 88 号' })
  @IsString()
  @MaxLength(255)
  address!: string;

  @ApiProperty({ description: '营业执照号', example: '91440300MA5FXXXXXX' })
  @IsString()
  @MaxLength(100)
  licenseNo!: string;

  @ApiProperty({ description: '渠道标识', example: 'lakala' })
  @IsString()
  channel!: string;

  @ApiProperty({ description: '租户采购服务到期日期，前端按 YYYY-MM-DD 提交', example: '2027-05-13' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'serviceExpireAt 必须是 YYYY-MM-DD 日期格式' })
  serviceExpireAt!: string;

  @ApiProperty({ description: '首个老板登录账号，当前按手机号使用', example: '13800138000' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  ownerAccount!: string;

  @ApiPropertyOptional({ description: '首个老板初始密码，不传则由服务端回退默认密码', example: '123456' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  ownerInitialPassword?: string;
}
