import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditTargetTypeEnum as PrismaAuditTargetTypeEnum,
  PrintingTemplatePackageStatusEnum as PrismaPackageStatusEnum,
  PrinterTemplateSourceEnum as PrismaSourceEnum,
  Prisma,
} from '@prisma/client';
import type { OrderImportTemplateField } from '@shou/types/contracts';
import {
  PrintingTemplatePackageStatusEnum,
  type PrintingTemplatePackageStatus,
} from '@shou/types/enums';
import type {
  AdminPrintingTemplatePackageDetail,
  AdminPrintingTemplatePackageItem,
  AdminPrintingTemplatePackageListResponse,
  CreatePrintingTemplatePackageCopyRequest,
  CreatePrintingTemplatePackageCopyResponse,
  CreatePrintingTemplatePackageDraftFromCandidateRequest,
  ErpVendorOption,
  PrintingTemplateCandidateDetail,
  PrintingTemplateCandidateItem,
  PrintingTemplateCandidateListResponse,
  PrintingTemplatePackageDetail,
  PrintingTemplatePackageListItem,
  UpdatePrintingTemplatePackageRequest,
} from '@shou/types/contracts';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { formatDateTime } from '../common/validators';
import { IdGeneratorService } from '../id-generator/id-generator.service';
import { PrismaService } from '../prisma/prisma.service';
import { createAuditLog, getOperatorDisplayName } from '../settings/settings.shared';
import { UploadService } from '../upload/upload.service';
import {
  ERP_VENDOR_NAME_BY_CODE,
  PRINTING_TEMPLATE_PACKAGE_ID_DIGITS,
  PRINTING_TEMPLATE_PACKAGE_ID_PREFIX,
} from './printing-template-package.constants';

@Injectable()
export class PrintingTemplatePackageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly idGenerator: IdGeneratorService,
  ) {}

  getErpVendorOptions(): ErpVendorOption[] {
    return Object.entries(ERP_VENDOR_NAME_BY_CODE).map(([code, name]) => ({ code, name }));
  }

  // ---- Tenant 侧 ----

  /** 查询已发布模板包列表 */
  async getPublishedPackageList(query: { erpVendor?: string; page?: number; pageSize?: number }): Promise<PrintingTemplatePackageListItem[]> {
    const items = await this.prisma.printingTemplatePackage.findMany({
      where: {
        status: 'PUBLISHED',
        ...(query.erpVendor ? { erpVendor: query.erpVendor } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
    return items.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description ?? undefined,
      erpVendor: pkg.erpVendor ?? undefined,
      erpVendorName: pkg.erpVendor ? ERP_VENDOR_NAME_BY_CODE[pkg.erpVendor] ?? undefined : undefined,
      previewImageUrl: this.uploadService.buildPublicUrl(pkg.previewObjectKey),
      tags: pkg.tags ?? [],
      version: pkg.version,
      updatedAt: formatDateTime(pkg.updatedAt),
    }));
  }

  /** 查询模板包详情 */
  async getPublishedPackageDetail(packageId: string): Promise<PrintingTemplatePackageDetail> {
    const pkg = await this.prisma.printingTemplatePackage.findFirst({
      where: { id: packageId, status: 'PUBLISHED' },
    });
    if (!pkg) throw new NotFoundException('模板包不存在或未发布');
    return {
      id: pkg.id,
      name: pkg.name,
      description: pkg.description ?? undefined,
      erpVendor: pkg.erpVendor ?? undefined,
      erpVendorName: pkg.erpVendor ? ERP_VENDOR_NAME_BY_CODE[pkg.erpVendor] ?? undefined : undefined,
      previewImageUrl: this.uploadService.buildPublicUrl(pkg.previewObjectKey),
      tags: pkg.tags ?? [],
      version: pkg.version,
      importTemplateSnapshot: pkg.importTemplateSnapshot as unknown as PrintingTemplatePackageDetail['importTemplateSnapshot'],
      printingConfigSnapshot: pkg.printingConfigSnapshot as Record<string, unknown>,
      updatedAt: formatDateTime(pkg.updatedAt),
    };
  }

  /** 租户复制模板包，事务内创建 ImportTemplate 与 PrinterTemplate */
  async createPackageCopy(
    currentUser: JwtPayload,
    packageId: string,
    request: CreatePrintingTemplatePackageCopyRequest,
  ): Promise<CreatePrintingTemplatePackageCopyResponse> {
    const tenantId = requireTenantId(currentUser);

    const pkg = await this.prisma.printingTemplatePackage.findFirst({
      where: { id: packageId, status: 'PUBLISHED' },
    });
    if (!pkg) throw new NotFoundException('模板包不存在或未发布');

    const snapshot = pkg.importTemplateSnapshot as { defaultFields: OrderImportTemplateField[]; customerFields: OrderImportTemplateField[] } | null;
    if (!snapshot?.defaultFields?.length) {
      throw new BadRequestException('模板包导入字段快照不完整');
    }

    const importTemplateName = request.importTemplateName || (await this.resolveUniqueTemplateName(tenantId, pkg.name));
    const operatorName = (await getOperatorDisplayName(this.prisma, currentUser.userId)) ?? undefined;

    const result = await this.prisma.$transaction(async (tx) => {
      const importTemplate = await tx.importTemplate.create({
        data: {
          tenantId,
          name: importTemplateName,
          isDefault: false,
          erpVendor: pkg.erpVendor,
          defaultFields: snapshot.defaultFields as unknown as Prisma.InputJsonValue,
          customerFields: (snapshot.customerFields ?? []) as unknown as Prisma.InputJsonValue,
        },
      });

      const printerTemplate = await tx.printerTemplate.create({
        data: {
          tenantId,
          importTemplateId: importTemplate.id,
          config: pkg.printingConfigSnapshot as Prisma.InputJsonValue,
          configVersion: 1,
          source: PrismaSourceEnum.OFFICIAL_PACKAGE,
          remark: request.remark ?? null,
          updatedBy: operatorName,
        },
      });

      return { importTemplate, printerTemplate };
    });

    await createAuditLog(this.prisma, currentUser, {
      tenantId,
      action: `安装官方模板包「${pkg.name}」`,
      target: result.importTemplate.id.toString(),
      targetType: PrismaAuditTargetTypeEnum.TENANT,
    });

    return {
      importTemplateId: String(result.importTemplate.id),
      importTemplateName: result.importTemplate.name,
    };
  }

  // ---- Admin 候选池 ----

  /** 跨租户查看租户已有打印配置候选 */
  async getCandidateList(query: { erpVendor?: string; page?: number; pageSize?: number }): Promise<PrintingTemplateCandidateListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.PrinterTemplateWhereInput = {};
    if (query.erpVendor) {
      where.importTemplate = { erpVendor: query.erpVendor };
    }

    const [items, total] = await Promise.all([
      this.prisma.printerTemplate.findMany({
        where,
        include: {
          importTemplate: { select: { id: true, name: true, erpVendor: true } },
          tenant: { select: { name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.printerTemplate.count({ where }),
    ]);

    const list: PrintingTemplateCandidateItem[] = items
      .filter((item) => item.importTemplate && item.tenant)
      .map((item) => ({
        printerTemplateId: String(item.id),
        tenantName: item.tenant!.name,
        importTemplateName: item.importTemplate!.name,
        erpVendor: item.importTemplate!.erpVendor ?? undefined,
        erpVendorName: item.importTemplate!.erpVendor ? ERP_VENDOR_NAME_BY_CODE[item.importTemplate!.erpVendor] ?? undefined : undefined,
        updatedAt: formatDateTime(item.updatedAt),
      }));

    return { list, total, page, pageSize };
  }

  /** 候选详情 */
  async getCandidateDetail(printerTemplateId: string): Promise<PrintingTemplateCandidateDetail> {
    const item = await this.prisma.printerTemplate.findUnique({
      where: { id: BigInt(printerTemplateId) },
      include: {
        importTemplate: { select: { id: true, name: true, erpVendor: true, defaultFields: true, customerFields: true } },
        tenant: { select: { name: true } },
      },
    });
    if (!item || !item.importTemplate || !item.tenant) throw new NotFoundException('候选模板不存在');

    return {
      printerTemplateId: String(item.id),
      tenantName: item.tenant.name,
      importTemplateName: item.importTemplate.name,
      erpVendor: item.importTemplate.erpVendor ?? undefined,
      erpVendorName: item.importTemplate.erpVendor ? ERP_VENDOR_NAME_BY_CODE[item.importTemplate.erpVendor] ?? undefined : undefined,
      defaultFields: (item.importTemplate.defaultFields as unknown as OrderImportTemplateField[]) ?? [],
      customerFields: (item.importTemplate.customerFields as unknown as OrderImportTemplateField[]) ?? [],
      config: item.config as Record<string, unknown>,
    };
  }

  /** 从候选创建模板包草稿 */
  async createDraftFromCandidate(
    currentUser: JwtPayload,
    printerTemplateId: string,
    request: CreatePrintingTemplatePackageDraftFromCandidateRequest,
  ): Promise<AdminPrintingTemplatePackageDetail> {
    const candidate = await this.getCandidateDetail(printerTemplateId);

    const packageId = await this.idGenerator.nextDailyId(PRINTING_TEMPLATE_PACKAGE_ID_PREFIX, PRINTING_TEMPLATE_PACKAGE_ID_DIGITS);

    let previewObjectKey: string | null = null;
    if (request.previewUploadId) {
      previewObjectKey = await this.uploadService.resolveTemplatePackagePreviewObjectKey(currentUser, request.previewUploadId);
    }

    const pkg = await this.prisma.printingTemplatePackage.create({
      data: {
        id: packageId,
        name: request.name,
        description: request.description ?? null,
        erpVendor: request.erpVendor ?? null,
        previewObjectKey,
        tags: request.tags ?? [],
        status: 'DRAFT',
        version: 1,
        importTemplateSnapshot: {
          defaultFields: candidate.defaultFields,
          customerFields: candidate.customerFields,
        } as unknown as Prisma.InputJsonValue,
        printingConfigSnapshot: candidate.config as unknown as Prisma.InputJsonValue,
      },
    });

    if (request.previewUploadId) {
      await this.uploadService.markTemplatePackagePreviewUsed(request.previewUploadId);
    }

    return toAdminDetail(pkg, this.uploadService);
  }

  // ---- Admin 模板包管理 ----

  async getAdminPackageList(query: { status?: string; erpVendor?: string; page?: number; pageSize?: number }): Promise<AdminPrintingTemplatePackageListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.PrintingTemplatePackageWhereInput = {};
    if (query.status) {
      where.status = query.status as PrismaPackageStatusEnum;
    }
    if (query.erpVendor) {
      where.erpVendor = query.erpVendor;
    }

    const [items, total] = await Promise.all([
      this.prisma.printingTemplatePackage.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take: pageSize }),
      this.prisma.printingTemplatePackage.count({ where }),
    ]);

    const list: AdminPrintingTemplatePackageItem[] = items.map((pkg) => toAdminItem(pkg, this.uploadService));

    return { list, total, page, pageSize };
  }

  async getAdminPackageDetail(packageId: string): Promise<AdminPrintingTemplatePackageDetail> {
    const pkg = await this.prisma.printingTemplatePackage.findUnique({ where: { id: packageId } });
    if (!pkg) throw new NotFoundException('模板包不存在');
    return toAdminDetail(pkg, this.uploadService);
  }

  async updatePackage(
    currentUser: JwtPayload,
    packageId: string,
    request: UpdatePrintingTemplatePackageRequest,
  ): Promise<AdminPrintingTemplatePackageDetail> {
    const existing = await this.prisma.printingTemplatePackage.findUnique({ where: { id: packageId } });
    if (!existing) throw new NotFoundException('模板包不存在');

    let previewObjectKey = existing.previewObjectKey;
    let oldPreviewObjectKey: string | null = null;

    if (request.previewUploadId === null) {
      oldPreviewObjectKey = existing.previewObjectKey;
      previewObjectKey = null;
    } else if (request.previewUploadId) {
      const newKey = await this.uploadService.resolveTemplatePackagePreviewObjectKey(currentUser, request.previewUploadId);
      oldPreviewObjectKey = existing.previewObjectKey;
      previewObjectKey = newKey;
    }

    const versionIncrement = existing.status === 'PUBLISHED' ? 1 : 0;

    const updated = await this.prisma.printingTemplatePackage.update({
      where: { id: packageId },
      data: {
        name: request.name ?? existing.name,
        description: request.description !== undefined ? (request.description ?? null) : existing.description,
        erpVendor: request.erpVendor !== undefined ? (request.erpVendor ?? null) : existing.erpVendor,
        previewObjectKey,
        tags: request.tags ?? existing.tags,
        version: { increment: versionIncrement },
      },
    });

    if (request.previewUploadId) {
      await this.uploadService.markTemplatePackagePreviewUsed(request.previewUploadId);
    }
    if (oldPreviewObjectKey && oldPreviewObjectKey !== previewObjectKey) {
      await this.uploadService.deleteTemplatePackagePreviewIfUnreferenced(oldPreviewObjectKey, previewObjectKey);
    }

    return toAdminDetail(updated, this.uploadService);
  }

  async publishPackage(currentUser: JwtPayload, packageId: string): Promise<AdminPrintingTemplatePackageDetail> {
    const existing = await this.prisma.printingTemplatePackage.findUnique({ where: { id: packageId } });
    if (!existing) throw new NotFoundException('模板包不存在');
    if (existing.status !== 'DRAFT') throw new BadRequestException('仅草稿状态可发布');

    const updated = await this.prisma.printingTemplatePackage.update({
      where: { id: packageId },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });

    await createAuditLog(this.prisma, currentUser, {
      tenantId: null,
      action: `发布官方模板包「${updated.name}」`,
      target: updated.id,
      targetType: PrismaAuditTargetTypeEnum.TENANT,
    });

    return toAdminDetail(updated, this.uploadService);
  }

  async offlinePackage(currentUser: JwtPayload, packageId: string): Promise<AdminPrintingTemplatePackageDetail> {
    const existing = await this.prisma.printingTemplatePackage.findUnique({ where: { id: packageId } });
    if (!existing) throw new NotFoundException('模板包不存在');
    if (existing.status !== 'PUBLISHED') throw new BadRequestException('仅已发布状态可下线');

    const updated = await this.prisma.printingTemplatePackage.update({
      where: { id: packageId },
      data: { status: 'OFFLINE' },
    });

    await createAuditLog(this.prisma, currentUser, {
      tenantId: null,
      action: `下线官方模板包「${updated.name}」`,
      target: updated.id,
      targetType: PrismaAuditTargetTypeEnum.TENANT,
    });

    return toAdminDetail(updated, this.uploadService);
  }

  /** 基于模板包名称生成租户内唯一导入模板名 */
  private async resolveUniqueTemplateName(tenantId: string, baseName: string): Promise<string> {
    const existing = await this.prisma.importTemplate.count({
      where: { tenantId, deletedAt: null, name: baseName },
    });
    if (existing === 0) return baseName;
    return `${baseName} 副本`;
  }
}

// ---- 工具函数 ----

function requireTenantId(currentUser: JwtPayload): string {
  if (!currentUser.tenantId) {
    throw new BadRequestException('当前登录态不属于租户侧');
  }
  return currentUser.tenantId;
}

function toAdminItem(
  pkg: {
    id: string;
    name: string;
    description: string | null;
    erpVendor: string | null;
    previewObjectKey: string | null;
    tags: string[];
    status: string;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    publishedAt: Date | null;
  },
  uploadService: UploadService,
): AdminPrintingTemplatePackageItem {
  return {
    id: pkg.id,
    name: pkg.name,
    description: pkg.description ?? undefined,
    erpVendor: pkg.erpVendor ?? undefined,
    erpVendorName: pkg.erpVendor ? ERP_VENDOR_NAME_BY_CODE[pkg.erpVendor] ?? undefined : undefined,
    previewImageUrl: uploadService.buildPublicUrl(pkg.previewObjectKey),
    tags: pkg.tags ?? [],
    status: pkg.status as unknown as PrintingTemplatePackageStatus,
    version: pkg.version,
    createdAt: formatDateTime(pkg.createdAt),
    updatedAt: formatDateTime(pkg.updatedAt),
    publishedAt: pkg.publishedAt ? formatDateTime(pkg.publishedAt) : null,
  };
}

function toAdminDetail(
  pkg: {
    id: string;
    name: string;
    description: string | null;
    erpVendor: string | null;
    previewObjectKey: string | null;
    tags: string[];
    status: string;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    publishedAt: Date | null;
    importTemplateSnapshot: Prisma.JsonValue;
    printingConfigSnapshot: Prisma.JsonValue;
  },
  uploadService: UploadService,
): AdminPrintingTemplatePackageDetail {
  return {
    ...toAdminItem(pkg, uploadService),
    importTemplateSnapshot: pkg.importTemplateSnapshot as unknown as AdminPrintingTemplatePackageDetail['importTemplateSnapshot'],
    printingConfigSnapshot: pkg.printingConfigSnapshot as Record<string, unknown>,
  };
}
