import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateOrderImportTemplateRequest,
  OrderImportCustomerFieldCreateRequest,
  OrderImportCustomerFieldUpdateRequest,
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

const TEMPLATE_FIELD_TYPE_TEXT: Record<string, string> = {
  list: '订单级字段',
  line: '商品行字段',
};

const CUSTOMER_FIELD_KEY_PATTERN = /^cf\d+$/;

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
    const normalized = this.normalizeCreateTemplatePayload(request);
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
    const normalized = this.normalizeUpdateTemplatePayload(current, {
      name: request.name ?? current.name,
      isDefault: request.isDefault ?? current.isDefault,
      defaultFields: request.defaultFields ?? current.defaultFields,
      customerFields: request.customerFields,
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

  // 规范化新建模板请求，校验系统字段并为租户自定义字段生成 cfN key
  private normalizeCreateTemplatePayload(
    payload: CreateOrderImportTemplateRequest,
  ): Pick<OrderImportTemplate, 'name' | 'isDefault' | 'defaultFields' | 'customerFields'> {
    const name = normalizeText(payload.name, 'name', 100);
    const defaultFields = this.normalizeDefaultFields(payload.defaultFields ?? []);
    const customerFields = this.normalizeCreateCustomerFields(payload.customerFields ?? []);

    return {
      name,
      isDefault: Boolean(payload.isDefault),
      defaultFields,
      customerFields,
    };
  }

  // 规范化更新模板请求，已有自定义字段按 key 保持稳定，新增字段分配未使用的 cfN key
  private normalizeUpdateTemplatePayload(
    current: OrderImportTemplate,
    payload: UpdateOrderImportTemplateRequest,
  ): Pick<OrderImportTemplate, 'name' | 'isDefault' | 'defaultFields' | 'customerFields'> {
    const name = normalizeText(payload.name ?? current.name, 'name', 100);
    const defaultFields = this.normalizeDefaultFields(payload.defaultFields ?? current.defaultFields);
    const customerFields =
      payload.customerFields === undefined
        ? current.customerFields
        : this.normalizeUpdateCustomerFields(payload.customerFields, current.customerFields);

    return {
      name,
      isDefault: Boolean(payload.isDefault ?? current.isDefault),
      defaultFields,
      customerFields,
    };
  }

  // 规范化系统字段，固定 key、label、isRequired 和 type，仅允许按 isRequired 规则填写 mapStr
  private normalizeDefaultFields(incomingDefaultFields: OrderImportTemplateField[]): OrderImportTemplateField[] {
    if (incomingDefaultFields.length !== DEFAULT_TEMPLATE_FIELDS.length) {
      throw new BadRequestException(`系统默认字段必须完整提交，共 ${DEFAULT_TEMPLATE_FIELDS.length} 项，请刷新模板后重试`);
    }

    this.ensureNoDuplicate(
      incomingDefaultFields.map((field) => normalizeText(field.key, 'defaultFields.key', 50)),
      '系统默认字段',
    );

    const defaultFieldMap = new Map<string, OrderImportTemplateField>(
      incomingDefaultFields.map((field: OrderImportTemplateField) => [field.key, field]),
    );

    const defaultFields = DEFAULT_TEMPLATE_FIELDS.map((field) => {
      const input = defaultFieldMap.get(field.key);
      if (!input) {
        throw new BadRequestException(`系统默认字段缺少「${field.label}」，请刷新模板后重试`);
      }
      if (input.label !== field.label) {
        throw new BadRequestException(`系统字段「${field.label}」不允许修改显示名，请刷新模板后重试`);
      }
      if (input.isRequired !== field.isRequired) {
        throw new BadRequestException(`系统字段「${field.label}」不允许修改映射必填配置，请刷新模板后重试`);
      }
      if ((input.type ?? 'list') !== field.type) {
        throw new BadRequestException(`系统字段「${field.label}」必须保持为${this.describeFieldType(field.type)}，请刷新模板后重试`);
      }
      const mapStr = readString(input?.mapStr) ?? '';
      if (field.isRequired && !mapStr) {
        throw new BadRequestException(`系统字段「${field.label}」必须配置对应的 Excel 表头`);
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

    const unexpectedDefaultField = incomingDefaultFields.find(
      (field: OrderImportTemplateField) => !DEFAULT_TEMPLATE_FIELDS.some((item) => item.key === field.key),
    );
    if (unexpectedDefaultField) {
      throw new BadRequestException(`不支持的系统字段 key：${unexpectedDefaultField.key}，请刷新模板后重试`);
    }

    return defaultFields;
  }

  // 新建模板时自定义字段 key 由服务端按提交顺序生成
  private normalizeCreateCustomerFields(customerFields: OrderImportCustomerFieldCreateRequest[]): OrderImportTemplateField[] {
    const normalized = customerFields.map((field, index) => this.normalizeCustomerField(field, index, `cf${index + 1}`));

    this.ensureNoDuplicate(
      normalized.map((field) => field.label),
      '自定义字段名称',
    );

    return normalized;
  }

  // 更新模板时保留已有 key；未带 key 的新字段分配当前模板中未使用的下一个 cfN
  private normalizeUpdateCustomerFields(
    customerFields: OrderImportCustomerFieldUpdateRequest[],
    currentCustomerFields: OrderImportTemplateField[],
  ): OrderImportTemplateField[] {
    const existingFieldMap = new Map(currentCustomerFields.map((field) => [field.key, field]));
    const usedKeys = new Set(existingFieldMap.keys());
    const submittedKeys = new Set<string>();
    const normalized = customerFields.map((field, index) => {
      if (field.key !== undefined) {
        const key = normalizeText(field.key, `第 ${index + 1} 个自定义字段 key`, 50);
        if (!CUSTOMER_FIELD_KEY_PATTERN.test(key)) {
          throw new BadRequestException(`自定义字段「${field.label}」的 key 不合法，请使用当前模板返回的 cfN key`);
        }
        const existing = existingFieldMap.get(key);
        if (!existing) {
          throw new BadRequestException(`自定义字段「${field.label}」的 key 不属于当前模板`);
        }
        if (submittedKeys.has(key)) {
          throw new BadRequestException(`自定义字段 key 重复：「${key}」`);
        }
        submittedKeys.add(key);
        return this.normalizeCustomerField(field, index, key, existing);
      }

      const nextKey = this.nextCustomerFieldKey(usedKeys);
      usedKeys.add(nextKey);
      submittedKeys.add(nextKey);
      return this.normalizeCustomerField(field, index, nextKey);
    });

    this.ensureNoDuplicate(
      normalized.map((field) => field.label),
      '自定义字段名称',
    );

    return normalized;
  }

  // 规范化单个自定义字段，新增字段使用默认值，已有字段在字段未提交时沿用旧配置
  private normalizeCustomerField(
    field: OrderImportCustomerFieldCreateRequest | OrderImportCustomerFieldUpdateRequest,
    index: number,
    key: string,
    existing?: OrderImportTemplateField,
  ): OrderImportTemplateField {
    const label = normalizeText(field.label, `第 ${index + 1} 个自定义字段名称`, 100);
    const mapStr = field.mapStr === undefined ? (existing?.mapStr ?? '') : (readString(field.mapStr) ?? '');
    const type = field.type ?? existing?.type ?? 'list';
    if (!['list', 'line'].includes(type)) {
      throw new BadRequestException(`自定义字段「${label}」的字段位置不正确，仅支持 list（订单级）或 line（商品行）`);
    }

    return {
      label,
      key,
      mapStr,
      isRequired: false,
      isValueRequired: field.isValueRequired ?? existing?.isValueRequired ?? false,
      type,
    };
  }

  // 基于当前模板已占用 key 分配下一个 cfN，避免排序调整影响已有字段 key
  private nextCustomerFieldKey(usedKeys: Set<string>): string {
    let index = 1;
    while (usedKeys.has(`cf${index}`)) {
      index += 1;
    }
    return `cf${index}`;
  }

  // 校验同一组值内不允许重复，按去首尾空格后的大小写不敏感值比较
  private ensureNoDuplicate(values: string[], label: string): void {
    const seen = new Set<string>();
    for (const value of values) {
      const normalized = value.trim().toLowerCase();
      if (seen.has(normalized)) {
        throw new BadRequestException(`${label}重复：「${value}」`);
      }
      seen.add(normalized);
    }
  }

  // 将模板字段来源翻译为面向业务用户的说明，避免错误提示暴露内部 type 值
  private describeFieldType(type: string | undefined): string {
    return TEMPLATE_FIELD_TYPE_TEXT[type ?? 'list'] ?? String(type);
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
