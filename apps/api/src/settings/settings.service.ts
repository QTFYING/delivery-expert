import { Injectable } from '@nestjs/common';
import { AuditTargetTypeEnum as PrismaAuditTargetTypeEnum, Prisma } from '@prisma/client';
import type {
  TenantAuditLogListResponse,
  TenantAuditLogQuery,
  TenantGeneralSettings,
  TenantPermissionTreeResponse,
  UpdateTenantGeneralSettingsRequest,
} from '@shou/types/contracts';
import dayjs from 'dayjs';
import { JwtPayload } from '../auth/decorators/current-user.decorator';
import { toTenantPermissionTreeResponse } from '../authorization/mapping/permission.mapper';
import { normalizePage, normalizePageSize } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import { GENERAL_SETTINGS_CONFIG_GROUP, GENERAL_SETTINGS_DEFAULTS } from './settings.constants';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs.query.dto';
import { mergeGeneralSettings, parseBooleanValue, parseNumberValue, toTenantOverrideUpdate } from './mapping/settings.mapper';
import { createAuditLog, getTenantSideId } from './settings.shared';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // 获取租户通用配置，返回平台默认值与租户覆盖值的合并结果
  async getGeneralSettings(currentUser: JwtPayload): Promise<TenantGeneralSettings> {
    const tenantId = getTenantSideId(currentUser);

    const [defaults, override] = await Promise.all([
      this.getPlatformGeneralSettingsDefaults(),
      this.prisma.tenantGeneralSettings.findUnique({
        where: { tenantId },
      }),
    ]);

    return mergeGeneralSettings(defaults, override);
  }

  // 仅更新租户通知与业务偏好覆盖层，不修改企业主体资料
  async updateGeneralSettings(currentUser: JwtPayload, request: UpdateTenantGeneralSettingsRequest, ip?: string): Promise<TenantGeneralSettings> {
    const tenantId = getTenantSideId(currentUser);
    const data = toTenantOverrideUpdate(request);

    if (Object.keys(data).length > 0) {
      await this.prisma.tenantGeneralSettings.upsert({
        where: { tenantId },
        create: {
          tenantId,
          ...data,
        },
        update: data,
      });
    }

    const result = await this.getGeneralSettings(currentUser);
    await createAuditLog(this.prisma, currentUser, {
      tenantId,
      action: '更新通用配置',
      target: 'tenant_general_settings',
      targetType: PrismaAuditTargetTypeEnum.TENANT,
      ip,
    });

    return result;
  }

  // 返回服务端定义的 Tenant 权限能力树 不是前端菜单或路由树
  getPermissions(): TenantPermissionTreeResponse {
    return toTenantPermissionTreeResponse();
  }

  // 查询当前租户审计日志，按登录态 tenantId 强制隔离
  async getAuditLogs(currentUser: JwtPayload, query: TenantAuditLogQuery | ListAuditLogsQueryDto): Promise<TenantAuditLogListResponse> {
    const tenantId = getTenantSideId(currentUser);
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize);
    const where: Prisma.AuditLogWhereInput = {
      tenantId,
    };

    if (query.operator?.trim()) {
      where.actor = {
        contains: query.operator.trim(),
        mode: 'insensitive',
      };
    }
    if (query.startDate || query.endDate) {
      where.time = {};
      if (query.startDate) {
        where.time.gte = dayjs(query.startDate).startOf('day').toDate();
      }
      if (query.endDate) {
        where.time.lte = dayjs(query.endDate).endOf('day').toDate();
      }
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { time: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      list: logs.map((item) => ({
        id: String(item.id),
        action: item.action,
        operator: item.actor,
        ip: item.ip ?? '',
        createdAt: item.time.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  // 读取平台默认通用配置，缺省项回退到内置常量
  private async getPlatformGeneralSettingsDefaults(): Promise<TenantGeneralSettings> {
    const configs = await this.prisma.systemConfig.findMany({
      where: { group: GENERAL_SETTINGS_CONFIG_GROUP },
    });

    const configMap = new Map(configs.map((item) => [item.key, item.value]));

    return {
      qrCodeExpiry: parseNumberValue(configMap.get('qrCodeExpiry'), GENERAL_SETTINGS_DEFAULTS.qrCodeExpiry),
      notifySeller: parseBooleanValue(configMap.get('notifySeller'), GENERAL_SETTINGS_DEFAULTS.notifySeller),
      notifyOwner: parseBooleanValue(configMap.get('notifyOwner'), GENERAL_SETTINGS_DEFAULTS.notifyOwner),
      notifyFinance: parseBooleanValue(configMap.get('notifyFinance'), GENERAL_SETTINGS_DEFAULTS.notifyFinance),
      creditRemindDays: parseNumberValue(configMap.get('creditRemindDays'), GENERAL_SETTINGS_DEFAULTS.creditRemindDays),
      dailyReportPush: parseBooleanValue(configMap.get('dailyReportPush'), GENERAL_SETTINGS_DEFAULTS.dailyReportPush),
    };
  }
}
