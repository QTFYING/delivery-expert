import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { OrderImportTemplateFieldSourceTypeEnum } from '@shou/types/enums';

export class ImportTemplateFieldDto {
  @ApiProperty({ description: '字段名称', example: '客户名称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label!: string;

  @ApiProperty({ description: '字段 key', example: 'customer' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  key!: string;

  @ApiPropertyOptional({ description: 'ERP 表头映射值；未传或为 null 时按空字符串处理', example: '客户名称', nullable: true })
  @IsOptional()
  @IsString()
  mapStr?: string | null;

  @ApiProperty({ description: '是否系统必填（仅前端 UI 展示用）', example: true })
  @IsBoolean()
  isRequired!: boolean;

  @ApiPropertyOptional({
    description: '服务端 /preview 是否强制该列有值；服务端以系统定义为准，前端传入值仅作参考',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isValueRequired?: boolean;

  @ApiProperty({
    description: '字段来源',
    enum: Object.values(OrderImportTemplateFieldSourceTypeEnum),
    example: OrderImportTemplateFieldSourceTypeEnum.LIST,
  })
  @IsString()
  @IsIn(Object.values(OrderImportTemplateFieldSourceTypeEnum))
  type!: (typeof OrderImportTemplateFieldSourceTypeEnum)[keyof typeof OrderImportTemplateFieldSourceTypeEnum];
}

export class ImportTemplateCustomerFieldCreateDto {
  @ApiProperty({ description: '字段名称', example: '客户编码' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label!: string;

  @ApiPropertyOptional({ description: 'ERP 表头映射值；未传或为 null 时按空字符串处理', example: '客商编码', nullable: true })
  @IsOptional()
  @IsString()
  mapStr?: string | null;

  @ApiPropertyOptional({
    description: '服务端 /preview 是否强制该自定义列有值，未传默认 false',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isValueRequired?: boolean;

  @ApiPropertyOptional({
    description: '字段来源，默认 list',
    enum: Object.values(OrderImportTemplateFieldSourceTypeEnum),
    example: OrderImportTemplateFieldSourceTypeEnum.LIST,
  })
  @IsOptional()
  @IsString()
  @IsIn(Object.values(OrderImportTemplateFieldSourceTypeEnum))
  type?: (typeof OrderImportTemplateFieldSourceTypeEnum)[keyof typeof OrderImportTemplateFieldSourceTypeEnum];
}

export class ImportTemplateCustomerFieldUpdateDto extends ImportTemplateCustomerFieldCreateDto {
  @ApiPropertyOptional({ description: '自定义字段 key；已有字段编辑时传回原 key，新增字段不传', example: 'cf1' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  key?: string;
}

export class CreateImportTemplateDto {
  @ApiProperty({ description: '模板名称', example: '饮品订单模板' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ description: '是否默认模板', example: true })
  @IsBoolean()
  isDefault!: boolean;

  @ApiProperty({ description: '系统默认字段映射', type: [ImportTemplateFieldDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ImportTemplateFieldDto)
  defaultFields!: ImportTemplateFieldDto[];

  @ApiProperty({ description: '自定义字段映射', type: [ImportTemplateCustomerFieldCreateDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportTemplateCustomerFieldCreateDto)
  customerFields!: ImportTemplateCustomerFieldCreateDto[];
}

export class UpdateImportTemplateDto {
  @ApiPropertyOptional({ description: '模板名称', example: '饮品订单模板' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: '是否默认模板', example: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: '系统默认字段映射', type: [ImportTemplateFieldDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportTemplateFieldDto)
  defaultFields?: ImportTemplateFieldDto[];

  @ApiPropertyOptional({ description: '自定义字段映射；已有字段编辑时传回 key，新增字段不传 key', type: [ImportTemplateCustomerFieldUpdateDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportTemplateCustomerFieldUpdateDto)
  customerFields?: ImportTemplateCustomerFieldUpdateDto[];
}
