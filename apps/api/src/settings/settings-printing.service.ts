import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditTargetTypeEnum as PrismaAuditTargetTypeEnum, Prisma } from '@prisma/client';
import type {
  GetPrintingConfigDetailResponse,
  GetPrintingConfigListResponse,
  PrintingConfigListItem,
  UpdatePrintingConfigRequest,
  UpdatePrintingConfigResponse,
} from '@shou/types/contracts';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { formatDateTime } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import { createAuditLog, getOperatorDisplayName, getTenantSideId } from './settings.shared';

@Injectable()
export class SettingsPrintingService {
  constructor(private readonly prisma: PrismaService) {}

  async getPrintingConfigList(currentUser: JwtPayload): Promise<GetPrintingConfigListResponse> {
    const tenantId = getTenantSideId(currentUser);

    const templates = await this.prisma.importTemplate.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      include: {
        printerTemplate: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return {
      items: templates.map((template) => {
        const item: PrintingConfigListItem = {
          importTemplateId: String(template.id),
          importTemplateName: template.name,
          hasCustomConfig: Boolean(template.printerTemplate),
        };

        if (template.printerTemplate) {
          item.configVersion = template.printerTemplate.configVersion;
          item.updatedAt = formatDateTime(template.printerTemplate.updatedAt);
          item.updatedBy = template.printerTemplate.updatedBy ?? undefined;
          item.remark = template.printerTemplate.remark ?? undefined;
        }

        return item;
      }),
    };
  }

  async getPrintingConfigDetail(currentUser: JwtPayload, importTemplateId: string): Promise<GetPrintingConfigDetailResponse> {
    const template = await this.getScopedImportTemplate(currentUser, importTemplateId);

    if (!template.printerTemplate) {
      return {
        importTemplateId: String(template.id),
        importTemplateName: template.name,
        hasCustomConfig: false,
      };
    }

    return {
      importTemplateId: String(template.id),
      importTemplateName: template.name,
      hasCustomConfig: true,
      configVersion: template.printerTemplate.configVersion,
      config: template.printerTemplate.config as Record<string, unknown>,
      updatedAt: formatDateTime(template.printerTemplate.updatedAt),
      updatedBy: template.printerTemplate.updatedBy ?? undefined,
      remark: template.printerTemplate.remark ?? undefined,
    };
  }

  async updatePrintingConfig(
    currentUser: JwtPayload,
    importTemplateId: string,
    request: UpdatePrintingConfigRequest,
    ip?: string,
  ): Promise<UpdatePrintingConfigResponse> {
    const tenantId = getTenantSideId(currentUser);
    await this.getScopedImportTemplate(currentUser, importTemplateId);

    const operator = await getOperatorDisplayName(this.prisma, currentUser.userId);
    const bigTemplateId = BigInt(importTemplateId);
    const template = await this.prisma.printerTemplate.upsert({
      where: {
        tenantId_importTemplateId: {
          tenantId,
          importTemplateId: bigTemplateId,
        },
      },
      create: {
        tenantId,
        importTemplateId: bigTemplateId,
        config: request.config as Prisma.InputJsonValue,
        configVersion: 1,
        remark: request.remark,
        updatedBy: operator,
      },
      update: {
        config: request.config as Prisma.InputJsonValue,
        configVersion: {
          increment: 1,
        },
        remark: request.remark,
        updatedBy: operator,
      },
    });

    const result = {
      importTemplateId: String(template.importTemplateId),
      hasCustomConfig: true,
      configVersion: template.configVersion,
      updatedAt: template.updatedAt.toISOString(),
      updatedBy: template.updatedBy ?? undefined,
      remark: template.remark ?? undefined,
    };

    await createAuditLog(this.prisma, currentUser, {
      tenantId,
      action: '更新打印配置',
      target: importTemplateId,
      targetType: PrismaAuditTargetTypeEnum.TENANT,
      ip,
    });

    return result;
  }

  private async getScopedImportTemplate(currentUser: JwtPayload, importTemplateId: string) {
    const tenantId = getTenantSideId(currentUser);

    const template = await this.prisma.importTemplate.findFirst({
      where: {
        id: BigInt(importTemplateId),
        tenantId,
        deletedAt: null,
      },
      include: {
        printerTemplate: true,
      },
    });

    if (!template) {
      throw new NotFoundException('未找到对应的导入映射模板');
    }

    return template;
  }
}
