import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateOrderImportTemplateRequest,
  OrderImportTemplate,
  OrderImportTemplateField,
  OrderImportTemplateMutationResponse,
  UpdateOrderImportTemplateRequest,
} from '@shou/types/contracts';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { normalizeText } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import { cloneDefaultTemplateFields, DEFAULT_TEMPLATE_FIELDS } from './import-template.fields';
import { readString, toTemplate, toTemplateMutationResponse } from './mapping/import.mapper';

@Injectable()
export class ImportTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  // 返回系统默认导入模板字段，服务端权威控制字段必填和值必填语义
  getDefaultTemplate(): OrderImportTemplateField[] {
    return cloneDefaultTemplateFields();
  }

  // 查询当前租户可用模板，并通过 mapper 兼容历史 JSON 字段缺省值
  async getImportTemplates(currentUser: JwtPayload): Promise<OrderImportTemplate[]> {
    const tenantId = this.requireTenantId(currentUser);
    const templates = await this.prisma.importTemplate.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    return templates.map((template) => toTemplate(template));
  }

  // 创建导入模板，固定系统字段定义并将前端提交的自定义字段编号后持久化
  async createImportTemplate(currentUser: JwtPayload, request: CreateOrderImportTemplateRequest): Promise<OrderImportTemplateMutationResponse> {
    const tenantId = this.requireTenantId(currentUser);
    const normalized = this.normalizeTemplatePayload(request);
    await this.ensureTemplateNameAvailable(tenantId, normalized.name);

    const created = await this.prisma.$transaction(async (tx) => {
      if (normalized.isDefault) {
        await tx.importTemplate.updateMany({
          where: { tenantId, deletedAt: null },
          data: { isDefault: false },
        });
      }

      return tx.importTemplate.create({
        data: {
          tenantId,
          name: normalized.name,
          isDefault: normalized.isDefault,
          defaultFields: normalized.defaultFields as unknown as Prisma.InputJsonValue,
          customerFields: normalized.customerFields as unknown as Prisma.InputJsonValue,
        },
      });
    });

    return toTemplateMutationResponse(created);
  }

  // 更新导入模板，系统字段以服务端定义为准，租户自定义字段按本次提交整体替换
  async updateImportTemplate(
    currentUser: JwtPayload,
    templateId: string,
    request: UpdateOrderImportTemplateRequest,
  ): Promise<OrderImportTemplateMutationResponse> {
    const tenantId = this.requireTenantId(currentUser);
    const existing = await this.getScopedTemplate(tenantId, templateId);
    const current = toTemplate(existing);
    const normalized = this.normalizeTemplatePayload({
      name: request.name ?? current.name,
      isDefault: request.isDefault ?? current.isDefault,
      defaultFields: request.defaultFields ?? current.defaultFields,
      customerFields:
        request.customerFields ??
        current.customerFields.map((field) => ({
          label: field.label,
          mapStr: field.mapStr,
        })),
    });
    await this.ensureTemplateNameAvailable(tenantId, normalized.name, templateId);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (normalized.isDefault) {
        await tx.importTemplate.updateMany({
          where: { tenantId, deletedAt: null, id: { not: BigInt(templateId) } },
          data: { isDefault: false },
        });
      }

      return tx.importTemplate.update({
        where: { id: BigInt(templateId) },
        data: {
          name: normalized.name,
          isDefault: normalized.isDefault,
          defaultFields: normalized.defaultFields as unknown as Prisma.InputJsonValue,
          customerFields: normalized.customerFields as unknown as Prisma.InputJsonValue,
        },
      });
    });

    return toTemplateMutationResponse(updated);
  }

  // 读取当前租户名下的模板，作为预检和模板维护的租户边界入口
  async getScopedTemplate(tenantId: string, templateId: string) {
    const template = await this.prisma.importTemplate.findFirst({
      where: { id: BigInt(templateId), tenantId, deletedAt: null },
    });
    if (!template) {
      throw new NotFoundException('未找到对应的导入模板');
    }
    return template;
  }

  // 规范化模板请求，校验系统字段完整性、固定语义和租户自定义字段结构
  private normalizeTemplatePayload(
    payload: CreateOrderImportTemplateRequest,
  ): Pick<OrderImportTemplate, 'name' | 'isDefault' | 'defaultFields' | 'customerFields'> {
    const name = normalizeText(payload.name, 'name', 100);
    const incomingDefaultFields = payload.defaultFields ?? [];
    if (incomingDefaultFields.length !== DEFAULT_TEMPLATE_FIELDS.length) {
      throw new BadRequestException(`defaultFields 必须完整包含 ${DEFAULT_TEMPLATE_FIELDS.length} 个系统字段`);
    }

    this.ensureNoDuplicate(
      incomingDefaultFields.map((field) => normalizeText(field.key, 'defaultFields.key', 50)),
      'defaultFields.key',
    );

    const defaultFieldMap = new Map<string, OrderImportTemplateField>(
      incomingDefaultFields.map((field: OrderImportTemplateField) => [field.key, field]),
    );

    const defaultFields = DEFAULT_TEMPLATE_FIELDS.map((field) => {
      const input = defaultFieldMap.get(field.key);
      if (!input) {
        throw new BadRequestException(`defaultFields 缺少系统字段：${field.key}（${field.label}）`);
      }
      if (input.label !== field.label) {
        throw new BadRequestException(`系统字段 ${field.key} 的 label 固定为"${field.label}"，不允许修改`);
      }
      if (input.isRequired !== field.isRequired) {
        throw new BadRequestException(`系统字段 ${field.key} 的 isRequired 固定为 ${field.isRequired}，不允许修改`);
      }
      const mapStr = readString(input?.mapStr) ?? '';
      if (field.isRequired && !mapStr) {
        throw new BadRequestException(`系统字段 ${field.key}（${field.label}）的 mapStr 不能为空`);
      }
      return {
        label: field.label,
        key: field.key,
        mapStr,
        isRequired: field.isRequired,
        isValueRequired: field.isValueRequired,
        type: field.type,
      };
    });

    const unexpectedDefaultField = (payload.defaultFields ?? []).find(
      (field: OrderImportTemplateField) => !DEFAULT_TEMPLATE_FIELDS.some((item) => item.key === field.key),
    );
    if (unexpectedDefaultField) {
      throw new BadRequestException(`默认字段 key 非法：${unexpectedDefaultField.key}`);
    }

    const customerFields = (payload.customerFields ?? []).map((field, index): OrderImportTemplateField => {
      const label = normalizeText(field.label, `customerFields[${index}].label`, 100);
      const mapStr = readString(field.mapStr) ?? '';

      return {
        label,
        key: `customerKey${index + 1}`,
        mapStr,
        isRequired: false,
        isValueRequired: field.isValueRequired ?? false,
        type: field.type ?? 'list',
      };
    });

    this.ensureNoDuplicate(
      customerFields.map((field) => field.label),
      'customerFields.label',
    );

    return {
      name,
      isDefault: Boolean(payload.isDefault),
      defaultFields,
      customerFields,
    };
  }

  // 校验同一组值内不允许重复，按去首尾空格后的大小写不敏感值比较
  private ensureNoDuplicate(values: string[], label: string): void {
    const seen = new Set<string>();
    for (const value of values) {
      const normalized = value.trim().toLowerCase();
      if (seen.has(normalized)) {
        throw new BadRequestException(`${label} 重复：${value}`);
      }
      seen.add(normalized);
    }
  }

  // 确保同一租户下模板名称唯一，更新时排除当前模板本身
  private async ensureTemplateNameAvailable(tenantId: string, name: string, excludeTemplateId?: string): Promise<void> {
    const existing = await this.prisma.importTemplate.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        id: excludeTemplateId ? { not: BigInt(excludeTemplateId) } : undefined,
        name: {
          equals: name,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new ConflictException('映射模板名称已存在');
    }
  }

  // 提取租户 ID，阻断平台侧或无租户登录态访问导入模板维护能力
  private requireTenantId(currentUser: JwtPayload): string {
    if (!currentUser.tenantId) {
      throw new ForbiddenException('当前登录态不属于租户侧，无法操作导入');
    }

    return currentUser.tenantId;
  }
}
