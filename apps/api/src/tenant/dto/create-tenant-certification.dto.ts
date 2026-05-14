import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateTenantCertificationDto {
  @ApiProperty({ description: '营业执照或资质文件地址', example: 'https://cdn.example.com/license.png' })
  @IsString()
  licenseUrl!: string;

  @ApiProperty({ description: '法人姓名', example: '张三' })
  @IsString()
  legalPerson!: string;

  @ApiProperty({ description: '法人身份证号', example: '440101199001010011' })
  @IsString()
  legalIdCard!: string;

  @ApiProperty({ description: '联系电话', example: '13800138000' })
  @IsString()
  contactPhone!: string;

  @ApiPropertyOptional({ description: '补充说明', example: '请优先审核' })
  @IsOptional()
  @IsString()
  remark?: string;
}
