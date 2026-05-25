const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  isImportWorkerEnabled,
  resolveImportJobFinalStatus,
  shouldStartImportJobImmediately,
} = require('../../dist/import/import-job.worker.helpers');
const { nextProgressForFailure, nextProgressForOutcome } = require('../../dist/import/import-job-runner.helpers');
const { buildPreviewSummary, normalizePreviewOrder, uniqueDuplicateOrders } = require('../../dist/import/import.normalizer');
const { toImportOrderCreateInput } = require('../../dist/import/import-job-order.persistence');
const { DEFAULT_TEMPLATE_FIELDS } = require('../../dist/import/import-template.fields');
const { ImportTemplateService } = require('../../dist/import/import-template.service');
const { readDate, readMoney, readPayType, readString } = require('../../dist/import/mapping/import.mapper');
const { toLineItemCreateInput, toAdminOrder, toTenantOrder } = require('../../dist/order/mapping/order.mapper');
const { normalizeOrderLineItem } = require('../../dist/order/order.validation');
const { deriveOrderStatus, resolveCreditOrderStatus } = require('../../dist/order/order.domain');
const {
  PAYMENT_PAYING_EXPIRE_MINUTES,
  buildCashPaymentSubmittedTransition,
  buildCashPaymentVerifiedTransition,
  resolvePaymentOrderStatus,
  shouldExpirePayingPaymentOrder,
} = require('../../dist/payment/payment.domain');
const { buildGatewayTradeNo } = require('../../dist/payment/payment.shared');

const OrderPayTypeEnum = {
  CASH: 'cash',
  CREDIT: 'credit',
};

const OrderStatusEnum = {
  PENDING: 'pending',
  PARTIAL: 'partial',
  PAID: 'paid',
  EXPIRED: 'expired',
  CREDIT: 'credit',
};

const CreditOrderStatusEnum = {
  NORMAL: 'normal',
  SOON: 'soon',
  TODAY: 'today',
  OVERDUE: 'overdue',
};

const OrderImportJobStatusEnum = {
  COMPLETED: 'completed',
  FAILED: 'failed',
};

const PaymentOrderStatusEnum = {
  UNPAID: 'unpaid',
  PAYING: 'paying',
  PENDING_VERIFICATION: 'pending_verification',
  PAID: 'paid',
  EXPIRED: 'expired',
};

const OfflinePaymentMethodEnum = {
  CASH: 'cash',
  OTHER_PAID: 'other_paid',
};

const PaymentMethodEnum = {
  CASH: 'cash',
  OTHER_PAID: 'other_paid',
};

const defaultFieldLabelMap = new Map(DEFAULT_TEMPLATE_FIELDS.map((field) => [field.key, field.label]));

function decimalLike(value) {
  return {
    toString: () => String(value),
    toFixed: (scale) => Number(value).toFixed(scale),
    toDecimalPlaces: () => decimalLike(value),
  };
}

function run(name, fn) {
  try {
    fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
}

run('IMPORT_JOB_WORKER_ENABLED=true 时启用独立 Worker', () => {
  assert.equal(isImportWorkerEnabled({ IMPORT_JOB_WORKER_ENABLED: 'true' }), true);
  assert.equal(shouldStartImportJobImmediately({ IMPORT_JOB_WORKER_ENABLED: 'true' }), true);
});

run('未开启 IMPORT_JOB_WORKER_ENABLED 时 API 进程不直接消费导入任务', () => {
  assert.equal(isImportWorkerEnabled({}), false);
  assert.equal(shouldStartImportJobImmediately({}), false);
});

run('全部失败且无成功/跳过/覆盖时任务状态为 FAILED', () => {
  assert.equal(
    resolveImportJobFinalStatus({
      successCount: 0,
      skippedCount: 0,
      overwrittenCount: 0,
      failedCount: 3,
    }),
    OrderImportJobStatusEnum.FAILED,
  );
});

run('存在成功、跳过或覆盖结果时任务最终状态为 COMPLETED', () => {
  assert.equal(
    resolveImportJobFinalStatus({
      successCount: 1,
      skippedCount: 0,
      overwrittenCount: 0,
      failedCount: 1,
    }),
    OrderImportJobStatusEnum.COMPLETED,
  );
  assert.equal(
    resolveImportJobFinalStatus({
      successCount: 0,
      skippedCount: 1,
      overwrittenCount: 0,
      failedCount: 2,
    }),
    OrderImportJobStatusEnum.COMPLETED,
  );
  assert.equal(
    resolveImportJobFinalStatus({
      successCount: 0,
      skippedCount: 0,
      overwrittenCount: 1,
      failedCount: 2,
    }),
    OrderImportJobStatusEnum.COMPLETED,
  );
});

run('构建产物包含独立导入 Worker 入口', () => {
  const workerEntry = path.join(__dirname, '..', '..', 'dist', 'import-worker.main.js');
  assert.equal(fs.existsSync(workerEntry), true);
});

run('构建产物包含导入 Worker 调度 helper', () => {
  const helperEntry = path.join(__dirname, '..', '..', 'dist', 'import', 'import-job.worker.helpers.js');
  assert.equal(fs.existsSync(helperEntry), true);
});

run('网关商户订单号使用系统订单号和两位尝试序号', () => {
  assert.equal(buildGatewayTradeNo('ORD20260518000002', 1), 'ORD20260518000002_01');
  assert.equal(buildGatewayTradeNo('ORD20260518000002', 12), 'ORD20260518000002_12');
});

run('导入字段解析覆盖字符串、时间、金额与结算方式规范化', () => {
  assert.equal(readString('  张三  '), '张三');
  assert.equal(readString('   '), undefined);
  assert.equal(readDate('2026-04-11T10:00:00.000Z').toISOString(), '2026-04-11T10:00:00.000Z');
  assert.equal(readMoney('1,234.56').toFixed(2), '1234.56');
  assert.equal(readPayType('账期'), OrderPayTypeEnum.CREDIT);
  assert.equal(readPayType('现金'), OrderPayTypeEnum.CASH);
});

run('导入预检摘要统计覆盖有效、无效与重复订单去重', () => {
  const duplicateOrders = uniqueDuplicateOrders([{ sourceOrderNo: 'SO-001' }, { sourceOrderNo: 'SO-001' }, { sourceOrderNo: 'SO-002' }]);

  assert.equal(duplicateOrders.length, 2);
  assert.deepEqual(
    buildPreviewSummary(
      3,
      [{ sourceOrderNo: 'SO-001' }, { sourceOrderNo: 'SO-002' }],
      [
        { index: 1, field: 'customer', reason: '客户名称不能为空' },
        { index: 1, field: 'customerAddress', reason: '客户地址不能为空' },
        { index: 3, field: 'orderTime', reason: '下单时间不能为空' },
      ],
      duplicateOrders,
    ),
    {
      totalOrders: 3,
      validOrders: 2,
      invalidOrders: 2,
      duplicateOrderCount: 2,
      errorCount: 3,
    },
  );
});

run('正式导入进度记录使用清晰冲突与失败原因', () => {
  const progress = {
    processedCount: 0,
    successCount: 0,
    skippedCount: 0,
    overwrittenCount: 0,
    failedOrders: [],
    conflictDetails: [],
  };
  const order = { index: 1, sourceOrderNo: 'SO-CONFLICT-001' };

  const skipped = nextProgressForOutcome(progress, order, {
    type: 'skipped',
    existingOrderId: 'O202605190001',
    reason: '源订单号已存在，当前冲突策略为“跳过”，本订单未导入',
  });
  assert.equal(skipped.skippedCount, 1);
  assert.equal(skipped.conflictDetails[0].reason, '源订单号已存在，当前冲突策略为“跳过”，本订单未导入');

  const failed = nextProgressForFailure(progress, order, '系统处理订单时异常，请联系管理员并提供导入任务 ID：JOB-001');
  assert.equal(failed.failedOrders[0].reason, '系统处理订单时异常，请联系管理员并提供导入任务 ID：JOB-001');
});

run('导入预检允许 0 元订单且正式导入落为已结清', () => {
  const valueRequiredMap = new Map([
    ['sourceOrderNo', true],
    ['customer', true],
    ['customerPhone', false],
    ['customerAddress', true],
    ['totalAmount', true],
    ['orderTime', true],
    ['payType', true],
  ]);

  const normalized = normalizePreviewOrder(
    {
      sourceOrderNo: 'SO-ZERO-001',
      customer: '零元客户',
      customerPhone: '13800138000',
      customerAddress: '深圳市南山区',
      totalAmount: 0,
      orderTime: '2026-04-15 09:30:00',
      payType: OrderPayTypeEnum.CASH,
      customerFieldValues: {},
      lineItems: [{ skuName: '赠品', unit: '件', quantity: 0, unitPrice: 0, lineAmount: 0 }],
    },
    1,
    '1',
    new Map(),
    new Map(),
    new Map(),
    defaultFieldLabelMap,
    valueRequiredMap,
  );

  assert.equal('value' in normalized, true);
  assert.equal(normalized.value.totalAmount, 0);

  const createInput = toImportOrderCreateInput('T000000001', normalized.value);
  assert.equal(createInput.totalAmount.toString(), '0');
  assert.equal(createInput.paid.toString(), '0');
  assert.equal(createInput.status, 'PAID');

  const negative = normalizePreviewOrder(
    {
      sourceOrderNo: 'SO-NEGATIVE-001',
      customer: '负数客户',
      customerPhone: '13800138000',
      customerAddress: '深圳市南山区',
      totalAmount: -1,
      orderTime: '2026-04-15 09:30:00',
      payType: OrderPayTypeEnum.CASH,
      customerFieldValues: {},
      lineItems: [{ skuName: '商品', unit: '件', quantity: 1, unitPrice: 1, lineAmount: 1 }],
    },
    2,
    '1',
    new Map(),
    new Map(),
    new Map(),
    defaultFieldLabelMap,
    valueRequiredMap,
  );

  assert.equal('error' in negative, true);
  assert.equal(negative.error[0].field, 'totalAmount');
  assert.equal(negative.error[0].reason, '总金额不能小于 0');
});

run('导入预检允许空客户电话且正式导入落为 NULL', () => {
  const valueRequiredMap = new Map([
    ['sourceOrderNo', true],
    ['customer', true],
    ['customerPhone', false],
    ['customerAddress', true],
    ['totalAmount', true],
    ['orderTime', true],
    ['payType', true],
  ]);

  const normalized = normalizePreviewOrder(
    {
      sourceOrderNo: 'SO-NO-PHONE-001',
      customer: '无手机号客户',
      customerPhone: '',
      customerAddress: '深圳市南山区',
      totalAmount: 1,
      orderTime: '2026-04-15 09:30:00',
      payType: OrderPayTypeEnum.CASH,
      customerFieldValues: {},
      lineItems: [{ skuName: '商品', unit: '件', quantity: 1, unitPrice: 1, lineAmount: 1 }],
    },
    1,
    '1',
    new Map(),
    new Map(),
    new Map(),
    defaultFieldLabelMap,
    valueRequiredMap,
  );

  assert.equal('value' in normalized, true);
  assert.equal(normalized.value.customerPhone, null);

  const createInput = toImportOrderCreateInput('T000000001', normalized.value);
  assert.equal(createInput.customerPhone, null);
});

run('正式导入订单明细保留包装规格和行级自定义字段', () => {
  const createInput = toImportOrderCreateInput('T000000001', {
    sourceOrderNo: 'SO-LINE-PERSIST-001',
    groupKey: 'SO-LINE-PERSIST-001',
    mappingTemplateId: '1',
    customer: '落库客户',
    customerPhone: null,
    customerAddress: '深圳市南山区',
    totalAmount: 97,
    orderTime: '2026-04-15 09:30:00',
    payType: OrderPayTypeEnum.CASH,
    customerFieldValues: {},
    lineItems: [
      {
        skuName: '桶面',
        skuSpec: '153g',
        unit: '箱',
        quantity: 1,
        packSpec: '24桶',
        unitPrice: 97,
        lineAmount: 97,
        customerFieldValues: { cf2: '批次A' },
      },
    ],
  });

  assert.equal(createInput.lineItems.create[0].packSpec, '24桶');
  assert.deepEqual(createInput.lineItems.create[0].customerFieldValues, { cf2: '批次A' });
});

run('订单明细读写映射保留包装规格和行级自定义字段', () => {
  const normalized = normalizeOrderLineItem({
    skuName: ' 桶面 ',
    skuSpec: ' 153g ',
    unit: ' 箱 ',
    quantity: 1,
    packSpec: ' 24桶 ',
    unitPrice: 97,
    lineAmount: 97,
    customerFieldValues: { cf2: '批次A' },
  });
  const createInput = toLineItemCreateInput(normalized);

  assert.equal(normalized.packSpec, '24桶');
  assert.deepEqual(normalized.customerFieldValues, { cf2: '批次A' });
  assert.equal(createInput.packSpec, '24桶');
  assert.deepEqual(createInput.customerFieldValues, { cf2: '批次A' });

  const orderRow = {
    id: 'O202605190001',
    sourceOrderNo: 'SO-DETAIL-001',
    groupKey: 'SO-DETAIL-001',
    mappingTemplateId: 1n,
    qrCodeToken: 'token',
    customer: '详情客户',
    customerPhone: null,
    customerAddress: '深圳市南山区',
    totalAmount: decimalLike(97),
    paid: decimalLike(0),
    customerFieldValues: {},
    status: 'PENDING',
    payType: 'CASH',
    prints: 0,
    lastPrintedAt: null,
    printFailedCount: 0,
    lastFailedAt: null,
    orderTime: new Date('2026-04-15 09:30:00'),
    voided: false,
    voidReason: null,
    voidedAt: null,
    lineItems: [
      {
        id: 1n,
        skuId: 'SKU-001',
        skuName: '桶面',
        skuSpec: '153g',
        unit: '箱',
        quantity: decimalLike(1),
        packSpec: '24桶',
        unitPrice: decimalLike(97),
        lineAmount: decimalLike(97),
        customerFieldValues: { cf2: '批次A' },
      },
    ],
  };

  assert.equal(toTenantOrder(orderRow).lineItems[0].packSpec, '24桶');
  assert.deepEqual(toTenantOrder(orderRow).lineItems[0].customerFieldValues, { cf2: '批次A' });
  assert.equal(toAdminOrder({ ...orderRow, tenant: { name: '测试租户' } }).lineItems[0].packSpec, '24桶');
  assert.deepEqual(toAdminOrder({ ...orderRow, tenant: { name: '测试租户' } }).lineItems[0].customerFieldValues, { cf2: '批次A' });
});

run('导入预检商品行字段错误使用模板中文名', () => {
  const valueRequiredMap = new Map([
    ['sourceOrderNo', true],
    ['customer', true],
    ['customerAddress', true],
    ['totalAmount', true],
    ['orderTime', true],
    ['payType', true],
    ['packSpec', true],
  ]);
  const normalized = normalizePreviewOrder(
    {
      sourceOrderNo: 'SO-LINE-001',
      customer: '行字段客户',
      customerAddress: '深圳市南山区',
      totalAmount: 1,
      orderTime: '2026-04-15 09:30:00',
      payType: OrderPayTypeEnum.CASH,
      customerFieldValues: {},
      lineItems: [{ skuName: '商品', unit: '箱', quantity: 1, unitPrice: 1, lineAmount: 1 }],
    },
    1,
    '1',
    new Map(),
    new Map(),
    new Map(),
    defaultFieldLabelMap,
    valueRequiredMap,
  );

  assert.equal('error' in normalized, true);
  assert.equal(normalized.error[0].field, 'lineItems[0].packSpec');
  assert.equal(normalized.error[0].reason, '第 1 条商品明细：包装规格不能为空');
});

run('导入预检商品行自定义字段校验区分字段位置并使用中文名', () => {
  const lineField = {
    label: '商品批次',
    key: 'cf2',
    mapStr: '批次',
    isRequired: false,
    isValueRequired: true,
    type: 'line',
  };
  const listField = {
    label: '客户编码',
    key: 'cf1',
    mapStr: '客户编码',
    isRequired: false,
    isValueRequired: false,
    type: 'list',
  };
  const lineCustomerFieldMap = new Map([[lineField.key, lineField]]);
  const allCustomerFieldMap = new Map([
    [lineField.key, lineField],
    [listField.key, listField],
  ]);

  const missing = normalizePreviewOrder(
    {
      sourceOrderNo: 'SO-CUSTOM-LINE-001',
      customer: '自定义字段客户',
      customerAddress: '深圳市南山区',
      totalAmount: 1,
      orderTime: '2026-04-15 09:30:00',
      payType: OrderPayTypeEnum.CASH,
      customerFieldValues: {},
      lineItems: [{ skuName: '商品', unit: '箱', quantity: 1, unitPrice: 1, lineAmount: 1 }],
    },
    1,
    '1',
    new Map(),
    lineCustomerFieldMap,
    allCustomerFieldMap,
    defaultFieldLabelMap,
    new Map([
      ['sourceOrderNo', true],
      ['customer', true],
      ['customerAddress', true],
      ['totalAmount', true],
      ['orderTime', true],
      ['payType', true],
    ]),
  );

  assert.equal('error' in missing, true);
  assert.equal(missing.error[0].field, 'lineItems[0].customerFieldValues.cf2');
  assert.equal(missing.error[0].reason, '商品行自定义字段「商品批次」不能为空');

  const wrongScope = normalizePreviewOrder(
    {
      sourceOrderNo: 'SO-CUSTOM-LINE-002',
      customer: '自定义字段客户',
      customerAddress: '深圳市南山区',
      totalAmount: 1,
      orderTime: '2026-04-15 09:30:00',
      payType: OrderPayTypeEnum.CASH,
      customerFieldValues: {},
      lineItems: [
        {
          skuName: '商品',
          unit: '箱',
          quantity: 1,
          unitPrice: 1,
          lineAmount: 1,
          customerFieldValues: { cf1: 'C001', cf2: 'B001' },
        },
      ],
    },
    2,
    '1',
    new Map([[listField.key, listField]]),
    lineCustomerFieldMap,
    allCustomerFieldMap,
    defaultFieldLabelMap,
    new Map([
      ['sourceOrderNo', true],
      ['customer', true],
      ['customerAddress', true],
      ['totalAmount', true],
      ['orderTime', true],
      ['payType', true],
    ]),
  );

  assert.equal('error' in wrongScope, true);
  assert.equal(wrongScope.error[0].field, 'lineItems[0].customerFieldValues.cf1');
  assert.equal(wrongScope.error[0].reason, '自定义字段「客户编码」属于订单级字段，应放在 customerFieldValues');

  const legacyKey = normalizePreviewOrder(
    {
      sourceOrderNo: 'SO-CUSTOM-LINE-003',
      customer: '自定义字段客户',
      customerAddress: '深圳市南山区',
      totalAmount: 1,
      orderTime: '2026-04-15 09:30:00',
      payType: OrderPayTypeEnum.CASH,
      customerFieldValues: {},
      lineItems: [
        {
          skuName: '商品',
          unit: '箱',
          quantity: 1,
          unitPrice: 1,
          lineAmount: 1,
          customerFieldValues: { customerKey2: 'B001', cf2: 'B001' },
        },
      ],
    },
    3,
    '1',
    new Map([[listField.key, listField]]),
    lineCustomerFieldMap,
    allCustomerFieldMap,
    defaultFieldLabelMap,
    new Map([
      ['sourceOrderNo', true],
      ['customer', true],
      ['customerAddress', true],
      ['totalAmount', true],
      ['orderTime', true],
      ['payType', true],
    ]),
  );

  assert.equal('error' in legacyKey, true);
  assert.equal(legacyKey.error[0].field, 'lineItems[0].customerFieldValues.customerKey2');
  assert.equal(legacyKey.error[0].reason, '自定义字段 key 不存在：customerKey2，请使用当前导入模板返回的 customerFields[].key');
});

run('导入模板维护错误提示面向业务字段', () => {
  const service = new ImportTemplateService({});

  assert.throws(
    () =>
      service.normalizeCreateTemplatePayload({
        name: '错误模板',
        isDefault: false,
        defaultFields: DEFAULT_TEMPLATE_FIELDS.slice(0, 13),
        customerFields: [],
      }),
    /系统默认字段必须完整提交，共 14 项，请刷新模板后重试/,
  );

  assert.throws(
    () =>
      service.normalizeCreateTemplatePayload({
        name: '错误模板',
        isDefault: false,
        defaultFields: DEFAULT_TEMPLATE_FIELDS.map((field) =>
          field.key === 'sourceOrderNo' ? { ...field, label: '订单编号' } : { ...field, mapStr: field.isRequired ? field.label : '' },
        ),
        customerFields: [],
      }),
    /系统字段「源订单号」不允许修改显示名/,
  );

  assert.throws(
    () =>
      service.normalizeCreateTemplatePayload({
        name: '错误模板',
        isDefault: false,
        defaultFields: DEFAULT_TEMPLATE_FIELDS.map((field) => ({ ...field, mapStr: field.isRequired ? field.label : '' })),
        customerFields: [
          { label: '客户编码', mapStr: '客户编码' },
          { label: ' 客户编码 ', mapStr: '客户编码2' },
        ],
      }),
    /自定义字段名称重复：「客户编码」/,
  );
});

run('订单状态推导覆盖现金、账期、部分支付、全额支付与作废场景', () => {
  assert.equal(deriveOrderStatus(OrderPayTypeEnum.CASH, '100', '0', false), OrderStatusEnum.PENDING);
  assert.equal(deriveOrderStatus(OrderPayTypeEnum.CREDIT, '100', '0', false), OrderStatusEnum.CREDIT);
  assert.equal(deriveOrderStatus(OrderPayTypeEnum.CASH, '100', '20', false), OrderStatusEnum.PARTIAL);
  assert.equal(deriveOrderStatus(OrderPayTypeEnum.CASH, '100', '100', false), OrderStatusEnum.PAID);
  assert.equal(deriveOrderStatus(OrderPayTypeEnum.CASH, '100', '0', true), OrderStatusEnum.EXPIRED);
});

run('账期状态推导覆盖逾期、当天、临近与正常场景', () => {
  const now = new Date('2026-04-11T09:00:00');
  assert.equal(resolveCreditOrderStatus(new Date('2026-04-10T12:00:00'), now), CreditOrderStatusEnum.OVERDUE);
  assert.equal(resolveCreditOrderStatus(new Date('2026-04-11T18:00:00'), now), CreditOrderStatusEnum.TODAY);
  assert.equal(resolveCreditOrderStatus(new Date('2026-04-15T12:00:00'), now), CreditOrderStatusEnum.SOON);
  assert.equal(resolveCreditOrderStatus(new Date('2026-04-25T12:00:00'), now), CreditOrderStatusEnum.NORMAL);
});

run('支付状态推导覆盖已作废、已支付、待支付与待核销场景', () => {
  assert.equal(
    resolvePaymentOrderStatus({ status: OrderStatusEnum.EXPIRED, voided: false, totalAmount: '100', paid: '0' }, null),
    PaymentOrderStatusEnum.EXPIRED,
  );
  assert.equal(
    resolvePaymentOrderStatus({ status: OrderStatusEnum.PAID, voided: false, totalAmount: '100', paid: '100' }, null),
    PaymentOrderStatusEnum.PAID,
  );
  assert.equal(
    resolvePaymentOrderStatus({ status: OrderStatusEnum.PENDING, voided: false, totalAmount: '100', paid: '0' }, null),
    PaymentOrderStatusEnum.UNPAID,
  );
  assert.equal(
    resolvePaymentOrderStatus(
      { status: OrderStatusEnum.PENDING, voided: false, totalAmount: '100', paid: '0' },
      { status: PaymentOrderStatusEnum.PENDING_VERIFICATION },
    ),
    PaymentOrderStatusEnum.PENDING_VERIFICATION,
  );
});

run('H5 other_paid 仅登记备注并等待租户确认', () => {
  const submitted = buildCashPaymentSubmittedTransition(OfflinePaymentMethodEnum.OTHER_PAID, new Date('2026-04-29T12:00:00.000Z'));
  assert.equal(submitted.allowed, true);
  assert.equal(submitted.data.status, PaymentOrderStatusEnum.PENDING_VERIFICATION);
  assert.equal(submitted.data.paymentMethod, OfflinePaymentMethodEnum.OTHER_PAID);
  assert.equal(submitted.data.paidAt, undefined);

  const verified = buildCashPaymentVerifiedTransition(
    {
      status: PaymentOrderStatusEnum.PENDING_VERIFICATION,
      paymentMethod: PaymentMethodEnum.OTHER_PAID,
    },
    new Date('2026-04-29T12:05:00.000Z'),
  );
  assert.equal(verified.allowed, true);
  assert.equal(verified.data.status, PaymentOrderStatusEnum.PAID);
});

run('PAYING 支付单超过超时时间后应转入过期判定', () => {
  assert.equal(
    shouldExpirePayingPaymentOrder(
      {
        status: PaymentOrderStatusEnum.PAYING,
        lastInitiatedAt: new Date(Date.now() - (PAYMENT_PAYING_EXPIRE_MINUTES + 1) * 60 * 1000),
      },
      new Date(),
    ),
    true,
  );
  assert.equal(
    shouldExpirePayingPaymentOrder(
      {
        status: PaymentOrderStatusEnum.PAYING,
        lastInitiatedAt: new Date(),
      },
      new Date(),
    ),
    false,
  );
});

run('构建产物包含订单领域规则 helper', () => {
  const helperEntry = path.join(__dirname, '..', '..', 'dist', 'order', 'order.domain.js');
  assert.equal(fs.existsSync(helperEntry), true);
});

run('构建产物包含支付领域规则 helper', () => {
  const helperEntry = path.join(__dirname, '..', '..', 'dist', 'payment', 'payment.domain.js');
  assert.equal(fs.existsSync(helperEntry), true);
});

run('构建产物包含导入预检归一化与映射 helper', () => {
  const normalizerEntry = path.join(__dirname, '..', '..', 'dist', 'import', 'import.normalizer.js');
  const mapperEntry = path.join(__dirname, '..', '..', 'dist', 'import', 'mapping', 'import.mapper.js');
  assert.equal(fs.existsSync(normalizerEntry), true);
  assert.equal(fs.existsSync(mapperEntry), true);
});
