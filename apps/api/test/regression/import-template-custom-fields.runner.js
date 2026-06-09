const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dayjs = require('dayjs');
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { PrismaClient } = require('@prisma/client');
const { apiRequest, expectHttpFailure, loadEnvFromFile, sanitizeDatabaseUrl, serializeError } = require('../shared/helpers');
const { FIXTURES, prepareFixtures, buildImportTemplatePayload, waitImportJob } = require('./fixtures');

loadEnvFromFile(path.join(__dirname, '..', '..', '.env'));
process.env.AUTH_COOKIE_SECURE = 'false';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.IMPORT_JOB_WORKER_ENABLED = 'true';

const { AppModule } = require('../../dist/app.module');
const { ResponseInterceptor } = require('../../dist/common/interceptors/response.interceptor');
const { GlobalExceptionFilter } = require('../../dist/common/filters/business-exception.filter');

const prisma = new PrismaClient();
const runtimeDir = path.join(__dirname, '..', '..', '.runtime');
const resultPath = path.join(runtimeDir, 'import-template-custom-fields-result.json');

function templatePayload(overrides = {}) {
  const payload = buildImportTemplatePayload();
  payload.name = overrides.name ?? `模板自定义字段回归-${dayjs().valueOf()}`;
  payload.defaultFields = payload.defaultFields.map(({ key, label, mapStr, type }) => ({ key, label, mapStr, type }));
  payload.customerFields = overrides.customerFields ?? [
    {
      label: '客户编码',
      mapStr: '客商编码',
      type: 'list',
    },
    {
      label: '商品批次',
      mapStr: '批次号',
      type: 'line',
    },
  ];
  return payload;
}

async function loadTemplate(baseUrl, token, templateId, results, stepName) {
  const response = await apiRequest(results, stepName, {
    method: 'GET',
    url: baseUrl + '/import/templates',
    token,
  });
  const template = response.data.find((item) => item.id === String(templateId));
  assert.ok(template, '未找到导入模板 ' + templateId);
  return template;
}

function assertInvalidReason(response, expectedPart) {
  const invalidOrders = response.data.invalidOrders ?? [];
  if (!invalidOrders.some((item) => String(item.reason).includes(expectedPart))) {
    throw new Error(`未找到预期预检错误: ${expectedPart}，实际=${JSON.stringify(invalidOrders)}`);
  }
}

async function main() {
  fs.mkdirSync(runtimeDir, { recursive: true });

  const results = {
    startedAt: new Date().toISOString(),
    environment: {
      database: sanitizeDatabaseUrl(process.env.DATABASE_URL || ''),
      redis: process.env.REDIS_URL || '',
      importWorkerEnabled: process.env.IMPORT_JOB_WORKER_ENABLED,
    },
    steps: [],
  };

  let app;
  try {
    await prepareFixtures(prisma);

    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.enableCors({ origin: true, credentials: true });

    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}/api`;
    results.baseUrl = baseUrl;

    const ownerLogin = await apiRequest(results, 'Auth Owner Login', {
      method: 'POST',
      url: `${baseUrl}/auth/login`,
      body: {
        account: FIXTURES.ownerAccount,
        password: FIXTURES.password,
      },
    });
    const token = ownerLogin.data.accessToken;

    const created = await apiRequest(results, 'T08-1 Create Template Missing Optional mapStr', {
      method: 'POST',
      url: `${baseUrl}/import/templates`,
      token,
      body: templatePayload(),
    });
    const templateId = created.data.id;
    const createdTemplate = await loadTemplate(baseUrl, token, templateId, results, 'T08-1b Load Created Template');
    const cf1 = createdTemplate.customerFields.find((field) => field.label === '客户编码');
    const cf2 = createdTemplate.customerFields.find((field) => field.label === '商品批次');
    assert.equal(cf1.key, 'cf1');
    assert.equal(cf2.key, 'cf2');
    assert.equal(cf2.type, 'line');
    assert.equal(cf2.isValueRequired, false);

    await expectHttpFailure(
      results,
      'T08-2 Create Template Reject Customer Field Key',
      {
        method: 'POST',
        url: `${baseUrl}/import/templates`,
        token,
        body: templatePayload({
          name: `模板非法 key-${dayjs().valueOf()}`,
          customerFields: [{ key: 'customer', label: '客户编码', mapStr: '客商编码', type: 'list' }],
        }),
      },
      400,
    );

    await expectHttpFailure(
      results,
      'T08-2b Create Template Reject Customer Field Value Required Config',
      {
        method: 'POST',
        url: `${baseUrl}/import/templates`,
        token,
        body: templatePayload({
          name: `模板非法值必填-${dayjs().valueOf()}`,
          customerFields: [{ label: '客户编码', mapStr: '客商编码', isValueRequired: true, type: 'list' }],
        }),
      },
      400,
    );

    const renameOnly = await apiRequest(results, 'T08-3 Update Name Preserve Customer Fields', {
      method: 'PUT',
      url: `${baseUrl}/import/templates/${templateId}`,
      token,
      body: {
        name: `模板自定义字段回归-改名-${dayjs().valueOf()}`,
      },
    });
    assert.equal(renameOnly.data.id, String(templateId));
    const renameOnlyTemplate = await loadTemplate(baseUrl, token, templateId, results, 'T08-3b Load Renamed Template');
    assert.equal(renameOnlyTemplate.customerFields.find((field) => field.key === 'cf2').type, 'line');
    assert.equal(renameOnlyTemplate.customerFields.find((field) => field.key === 'cf2').isValueRequired, false);

    const reordered = await apiRequest(results, 'T08-4 Update Reorder Preserve Existing Keys', {
      method: 'PUT',
      url: `${baseUrl}/import/templates/${templateId}`,
      token,
      body: {
        customerFields: [
          { key: 'cf2', label: '商品批次', mapStr: '批次号', type: 'line' },
          { key: 'cf1', label: '客户编码', mapStr: '客商编码', type: 'list' },
        ],
      },
    });
    assert.equal(reordered.data.id, String(templateId));
    const reorderedTemplate = await loadTemplate(baseUrl, token, templateId, results, 'T08-4b Load Reordered Template');
    assert.equal(reorderedTemplate.customerFields[0].key, 'cf2');
    assert.equal(reorderedTemplate.customerFields[1].key, 'cf1');
    assert.equal(reorderedTemplate.customerFields[0].isValueRequired, false);
    assert.equal(reorderedTemplate.customerFields[1].isValueRequired, false);

    const withNewField = await apiRequest(results, 'T08-5 Update Add Customer Field Assign Next Key', {
      method: 'PUT',
      url: `${baseUrl}/import/templates/${templateId}`,
      token,
      body: {
        customerFields: [
          { key: 'cf2', label: '商品批次', mapStr: '批次号', type: 'line' },
          { key: 'cf1', label: '客户编码', mapStr: '客商编码', type: 'list' },
          { label: '行备注', mapStr: '行备注', type: 'line' },
        ],
      },
    });
    assert.equal(withNewField.data.id, String(templateId));
    const withNewFieldTemplate = await loadTemplate(baseUrl, token, templateId, results, 'T08-5b Load Template With New Field');
    const cf3 = withNewFieldTemplate.customerFields.find((field) => field.label === '行备注');
    assert.equal(cf3.key, 'cf3');

    await expectHttpFailure(
      results,
      'T08-6 Update Reject Unknown Customer Field Key',
      {
        method: 'PUT',
        url: `${baseUrl}/import/templates/${templateId}`,
        token,
        body: {
          customerFields: [{ key: 'cf999', label: '非法字段', mapStr: '非法字段', type: 'line' }],
        },
      },
      400,
    );

    const baseOrder = {
      sourceOrderNo: `T08-PREVIEW-${dayjs().valueOf()}`,
      customer: '深圳联调客户',
      customerPhone: '13800001111',
      customerAddress: '广东省深圳市南山区',
      totalAmount: 48,
      orderTime: '2026-04-11 10:00:00',
      payType: 'cash',
      customerFieldValues: { cf1: 'MD001' },
      lineItems: [
        {
          skuName: '泡面',
          skuSpec: '153g',
          unit: '箱',
          quantity: 1,
          packSpec: '24桶',
          unitPrice: 48,
          lineAmount: 48,
          customerFieldValues: { cf2: '批次A', cf3: '行备注A' },
        },
      ],
    };

    const lineKeyAtOrderLevel = await apiRequest(results, 'T08-7 Preview Reject Line Key At Order Level', {
      method: 'POST',
      url: `${baseUrl}/import/preview`,
      token,
      body: {
        templateId,
        orders: [
          {
            ...baseOrder,
            sourceOrderNo: `${baseOrder.sourceOrderNo}-line-at-order`,
            customerFieldValues: { cf1: 'MD001', cf2: '批次A' },
          },
        ],
      },
    });
    assertInvalidReason(lineKeyAtOrderLevel, '属于商品行字段');

    const listKeyAtLineLevel = await apiRequest(results, 'T08-8 Preview Reject List Key At Line Level', {
      method: 'POST',
      url: `${baseUrl}/import/preview`,
      token,
      body: {
        templateId,
        orders: [
          {
            ...baseOrder,
            sourceOrderNo: `${baseOrder.sourceOrderNo}-list-at-line`,
            lineItems: [
              {
                ...baseOrder.lineItems[0],
                customerFieldValues: { cf1: 'MD001', cf2: '批次A', cf3: '行备注A' },
              },
            ],
          },
        ],
      },
    });
    assertInvalidReason(listKeyAtLineLevel, '属于订单级字段');

    const sourceOrderNo = `T08-IMPORT-${dayjs().valueOf()}`;
    const validPreview = await apiRequest(results, 'T08-9 Import Preview Valid Line Fields', {
      method: 'POST',
      url: `${baseUrl}/import/preview`,
      token,
      body: {
        templateId,
        orders: [{ ...baseOrder, sourceOrderNo }],
      },
    });
    assert.equal(validPreview.data.invalidOrders.length, 0);

    const dateOnlyPreview = await apiRequest(results, 'T08-10 Preview Accept Date Only Order Time', {
      method: 'POST',
      url: `${baseUrl}/import/preview`,
      token,
      body: {
        templateId,
        orders: [{ ...baseOrder, sourceOrderNo: `${sourceOrderNo}-date-only`, orderTime: '2026-04-11' }],
      },
    });
    assert.equal(dateOnlyPreview.data.invalidOrders.length, 0);
    assert.equal(dateOnlyPreview.data.orders[0].orderTime, '2026-04-11 00:00:00');

    const importSubmit = await apiRequest(results, 'T08-9 Import Submit', {
      method: 'POST',
      url: `${baseUrl}/orders/import`,
      token,
      body: {
        previewId: validPreview.data.previewId,
        conflictPolicy: 'overwrite',
      },
    });
    const importJob = await waitImportJob(baseUrl, token, importSubmit.data.jobId, results);
    assert.equal(importJob.data.status, 'completed');

    const orderList = await apiRequest(results, 'T08-9 Orders List Imported', {
      method: 'GET',
      url: `${baseUrl}/orders?keyword=${encodeURIComponent(sourceOrderNo)}`,
      token,
    });
    const order = orderList.data.list.find((item) => item.sourceOrderNo === sourceOrderNo);
    assert.ok(order);

    const orderDetail = await apiRequest(results, 'T08-9 Order Detail Has Line Fields', {
      method: 'GET',
      url: `${baseUrl}/orders/${order.id}`,
      token,
    });
    assert.equal(orderDetail.data.lineItems[0].packSpec, '24桶');
    assert.deepEqual(orderDetail.data.lineItems[0].customerFieldValues, { cf2: '批次A', cf3: '行备注A' });

    results.finishedAt = new Date().toISOString();
    results.ok = true;
    fs.writeFileSync(resultPath, JSON.stringify(results, null, 2));
    process.stdout.write(`PASS import template custom fields regression (${results.steps.length} steps)\n`);
  } catch (error) {
    const payload = {
      ok: false,
      failedAt: new Date().toISOString(),
      error: serializeError(error),
      steps: results.steps,
    };
    fs.writeFileSync(resultPath, JSON.stringify(payload, null, 2));
    throw error;
  } finally {
    if (app) {
      await app.close();
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
