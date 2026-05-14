import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { TenantSoftwareVersionEnum } from '@shou/types/enums';

export class CreateOsTenantDto {
  @ApiProperty({ description: '租户名称', example: '华南一区商户A' })
  @IsString()
  name!: string;

  @ApiProperty({ description: '租户采购的软件版本级别', enum: Object.values(TenantSoftwareVersionEnum), example: TenantSoftwareVersionEnum.L1 })
  @IsEnum(TenantSoftwareVersionEnum)
  softwareVersion!: (typeof TenantSoftwareVersionEnum)[keyof typeof TenantSoftwareVersionEnum];

  @ApiProperty({ description: '管理员名称', example: '张三' })
  @IsString()
  admin!: string;

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

  @ApiProperty({ description: '租户采购服务到期时间', example: '2027-05-13T23:59:59.000Z' })
  @IsDateString()
  serviceExpireAt!: string;

  @ApiProperty({ description: '首个老板登录账号', example: 'tenant_a_boss' })
  @IsString()
  ownerAccount!: string;

  @ApiProperty({ description: '首个老板手机号', example: '13800138000' })
  @IsString()
  ownerPhone!: string;

  @ApiPropertyOptional({ description: '首个老板初始密码，不传则由服务端回退默认密码', example: '123456' })
  @IsOptional()
  @IsString()
  ownerInitialPassword?: string;
}
