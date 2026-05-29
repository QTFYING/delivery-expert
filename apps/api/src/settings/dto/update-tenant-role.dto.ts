import { ApiPropertyOptional } from '@nestjs/swagger';
import type { UpdateTenantRoleRequest } from '@shou/types/contracts';
import { TenantPermissionCodeEnum } from '@shou/types/enums';
import { ArrayNotEmpty, IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateTenantRoleDto implements UpdateTenantRoleRequest {
  @ApiPropertyOptional({ description: '角色名称', example: '客服主管' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '角色描述', example: '负责订单查看和催款提醒' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: '角色包含的权限编码',
    enum: Object.values(TenantPermissionCodeEnum),
    isArray: true,
    example: [TenantPermissionCodeEnum.ORDERS_READ, TenantPermissionCodeEnum.ORDERS_REMINDER_CREATE],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(TenantPermissionCodeEnum, { each: true })
  permissionCodes?: UpdateTenantRoleRequest['permissionCodes'];
}
