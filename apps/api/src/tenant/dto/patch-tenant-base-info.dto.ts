import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { TenantSoftwareVersionEnum } from '@shou/types/enums';

export class PatchTenantBaseInfoDto {
  @ApiPropertyOptional({ description: '租户名称', example: '华南一区商户A' })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: '联系地址', example: '河南省郑州市金水区经三路 88 号' })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ description: '统一社会信用代码', example: '91440300MA5FXXXXXX' })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  licenseNo?: string;

  @ApiPropertyOptional({
    description: '租户采购的软件版本级别',
    enum: Object.values(TenantSoftwareVersionEnum),
    example: TenantSoftwareVersionEnum.L2,
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(TenantSoftwareVersionEnum)
  softwareVersion?: (typeof TenantSoftwareVersionEnum)[keyof typeof TenantSoftwareVersionEnum];

  @ApiPropertyOptional({ description: '租户采购服务到期日期，前端按 YYYY-MM-DD 提交', example: '2027-05-13' })
  @ValidateIf((_, value) => value !== undefined)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'serviceExpireAt 必须是 YYYY-MM-DD 日期格式' })
  serviceExpireAt?: string;
}
